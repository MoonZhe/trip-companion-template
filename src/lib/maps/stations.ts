'use client';
import { cityForStop } from '@/lib/trip/city';
import { useEffect, useState } from 'react';
import type { Day } from '@/lib/sheet/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { readCached, writeCached } from '@/lib/offline/store';
import { placeQuery } from '@/lib/trip/places';
import { metres, shortStation, walkMinutes } from '@/lib/trip/geo';
import { loadMaps, resolvePlaces, type Place } from './google';

export interface Station {
  name: string;
  walkMin: number;
  lat: number;
  lng: number;
}

type Found = Record<string, Station>; // by place query

interface StationHit {
  name: string;
  lat: number;
  lng: number;
}

/** Nearest station with Google Places. Undefined when Places failed (so OpenStreetMap gets a go). */
async function googleStation(pos: { lat: number; lng: number }): Promise<StationHit | null | undefined> {
  try {
    const { places } = await google.maps.places.Place.searchNearby({
      fields: ['displayName', 'location'],
      locationRestriction: { center: pos, radius: 1200 },
      includedPrimaryTypes: ['train_station', 'subway_station', 'light_rail_station'],
      rankPreference: google.maps.places.SearchNearbyRankPreference.DISTANCE,
      maxResultCount: 1,
    });
    const p = places[0];
    if (!p?.location || !p.displayName) return null;
    return { name: shortStation(p.displayName), lat: p.location.lat(), lng: p.location.lng() };
  } catch {
    return undefined;
  }
}

/** place_cache key for the station nearest a stop. */
const stationKey = (q: string) => `stn:${q}`;

// Today shows two timelines for the same day; share one lookup between them.
const inflight = new Map<string, Promise<Found>>();

/** Station for every query we can answer, from place_cache or one batched OpenStreetMap lookup. */
async function findStations(queries: string[]): Promise<Found> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from('place_cache')
    .select('query,status,lat,lng,label')
    .in('query', [...queries, ...queries.map(stationKey)]);
  if (error) throw error;
  const rows = new Map(((data ?? []) as Place[]).map((r) => [r.query, r]));

  // Where each stop is. Places the map hasn't pinned yet are looked up once (needs the Maps script).
  const unpinned = queries.filter((q) => !rows.has(q));
  if (unpinned.length) {
    await loadMaps();
    for (const [q, p] of await resolvePlaces(sb, unpinned)) rows.set(q, p);
  }
  const spots = queries
    .map((q) => ({ q, spot: rows.get(q) }))
    .filter((x): x is { q: string; spot: Place & { lat: number; lng: number } } => x.spot?.lat != null && x.spot.lng != null);

  const missing = spots.filter((x) => !rows.has(stationKey(x.q)));
  if (missing.length) {
    const now = new Date().toISOString();
    const save = async (fresh: Place[]) => {
      if (!fresh.length) return;
      await sb.from('place_cache').upsert(fresh.map((r) => ({ ...r, updated_at: now })));
      for (const r of fresh) rows.set(r.query, r);
    };
    const row = (q: string, st: StationHit | null): Place =>
      st
        ? { query: stationKey(q), status: 'found', lat: st.lat, lng: st.lng, label: st.name }
        : { query: stationKey(q), status: 'none', lat: null, lng: null, label: null };

    // Google first (quick); anything it couldn't answer goes to OpenStreetMap in one batch.
    await loadMaps();
    const viaGoogle: Place[] = [];
    const rest: typeof missing = [];
    for (const x of missing) {
      const hit = await googleStation(x.spot);
      if (hit === undefined) rest.push(x);
      else viaGoogle.push(row(x.q, hit));
    }
    await save(viaGoogle);

    if (rest.length) {
      const res = await fetch('/api/station', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: rest.map((x) => ({ lat: x.spot.lat, lng: x.spot.lng })) }),
      });
      // A failed lookup isn't cached, so it's tried again next time.
      if (res.ok) {
        const { stations } = (await res.json()) as { stations: (StationHit | null)[] };
        await save(rest.map((x, i) => row(x.q, stations[i])));
      }
    }
  }

  const out: Found = {};
  for (const { q, spot } of spots) {
    const st = rows.get(stationKey(q));
    if (st?.status !== 'found' || st.lat == null || st.lng == null || !st.label) continue;
    out[q] = { name: st.label, walkMin: walkMinutes(metres(spot, st as { lat: number; lng: number })), lat: st.lat, lng: st.lng };
  }
  return out;
}

const queriesFor = (day: Day) =>
  day.stops
    .map((s) => ({ key: s.key, query: placeQuery(s, cityForStop(day, s)) }))
    .filter((s): s is { key: string; query: string } => !!s.query);

async function fetchMissing(queries: string[]): Promise<Found> {
  const cached = (await readCached<Found>('stations')) ?? {};
  // Entries saved before stations had coordinates are looked up again (from place_cache, no API call).
  const todo = [...new Set(queries.filter((q) => cached[q]?.lat == null))];
  if (!todo.length || !navigator.onLine) return cached;
  const id = todo.join('|');
  if (!inflight.has(id))
    inflight.set(
      id,
      findStations(todo).finally(() => inflight.delete(id)),
    );
  const found = await inflight.get(id)!;
  const all = { ...((await readCached<Found>('stations')) ?? {}), ...found };
  await writeCached('stations', all);
  return all;
}

// Open useStations hooks, told to look again when a station is forgotten.
const listeners = new Set<() => void>();

/** Forget a stop's station, e.g. after its pin was moved with "Wrong spot?", so it's found again. */
export async function forgetStation(query: string): Promise<void> {
  const cached = (await readCached<Found>('stations')) ?? {};
  delete cached[query];
  await writeCached('stations', cached);
  await supabaseBrowser().from('place_cache').delete().eq('query', stationKey(query));
  listeners.forEach((f) => f());
}

/** Look up every day's stations once, in the background, so they're there offline. */
export async function warmStations(days: Day[]): Promise<void> {
  for (const d of days) await fetchMissing(queriesFor(d).map((s) => s.query)).catch(() => null);
}

/**
 * The nearest train or metro station to each stop of the day, keyed by stop key. Looked up once
 * (Google Places, falling back to OpenStreetMap) and saved in place_cache (as "stn:<query>")
 * for both phones, and on this phone for offline use.
 */
export function useStations(day: Day): Map<string, Station> {
  const [out, setOut] = useState<Map<string, Station>>(new Map());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stops = queriesFor(day);
    if (!stops.length) return;
    const show = (found: Found) =>
      !cancelled && setOut(new Map(stops.filter((s) => found[s.query]).map((s) => [s.key, found[s.query]])));

    (async () => {
      show((await readCached<Found>('stations')) ?? {});
      show(await fetchMissing(stops.map((s) => s.query)));
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [day, version]);

  return out;
}
