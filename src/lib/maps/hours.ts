'use client';
import { cityForStop } from '@/lib/trip/city';
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day } from '@/lib/sheet/types';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { readCached, writeCached } from '@/lib/offline/store';
import { placeQuery } from '@/lib/trip/places';
import { metres } from '@/lib/trip/geo';
import { checkHours, hoursTodayText, type HoursCheck, type Period } from '@/lib/trip/hours';
import { parseMinutes } from '@/lib/trip/travel';
import { loadMaps, resolvePlaces, type Place } from './google';

export interface Hours {
  p: Period[];
  /** Google's weekday lines, Monday first. */
  w: string[];
}

type Found = Record<string, Hours | null>; // by place query; null = no hours known

type Opening = { day: number; hour: number; minute: number };
type Row = Place & { updated_at: string };

const REFRESH_MS = 14 * 24 * 60 * 60 * 1000;
/** A place this far from its pin is probably the wrong one. */
const MAX_METRES = 400;

/** place_cache key for a stop's opening hours. */
const hoursKey = (q: string) => `hrs:${q}`;
const weekMinutes = (t: Opening) => t.day * 1440 + t.hour * 60 + t.minute;

// Today shows two timelines for the same day; share one lookup between them.
const inflight = new Map<string, Promise<Found>>();

/** Hours saved in a place_cache row, or undefined when the row is unreadable. */
function fromRow(row: Row): Hours | null | undefined {
  if (row.status === 'none') return null;
  if (row.status !== 'found' || !row.label) return undefined;
  try {
    return JSON.parse(row.label) as Hours;
  } catch {
    return undefined;
  }
}

/**
 * Opening hours for one query, from Google Places. Undefined when the lookup failed (not cached,
 * so it's tried again next time).
 */
async function lookupOne(sb: SupabaseClient, query: string): Promise<Hours | null | undefined> {
  try {
    // Where the stop is pinned. Not pinned yet: pin it first (needs the Maps script).
    const { data } = await sb.from('place_cache').select('query,status,lat,lng,label').eq('query', query).maybeSingle();
    let pin = data as Place | null;
    if (!pin) {
      await loadMaps();
      pin = (await resolvePlaces(sb, [query])).get(query) ?? null;
    }

    await loadMaps();
    const hasPin = pin?.lat != null && pin.lng != null;
    const { places } = await google.maps.places.Place.searchByText({
      textQuery: pin?.status === 'manual' && pin.label ? pin.label : query,
      fields: ['regularOpeningHours', 'displayName', 'location'],
      ...(hasPin ? { locationBias: { lat: pin!.lat!, lng: pin!.lng! } } : {}),
      maxResultCount: 1,
    });

    const place = places[0];
    let hours: Hours | null = null;
    const loc = place?.location;
    const wrongPlace =
      !!loc && hasPin && metres({ lat: pin!.lat!, lng: pin!.lng! }, { lat: loc.lat(), lng: loc.lng() }) > MAX_METRES;
    const periods = place?.regularOpeningHours?.periods ?? [];
    if (place && !wrongPlace && periods.length) {
      hours = {
        p: periods.map((x) => ({
          open: weekMinutes(x.open as Opening),
          close: x.close ? weekMinutes(x.close as Opening) : null,
        })),
        w: place.regularOpeningHours?.weekdayDescriptions ?? [],
      };
    }

    const row: Row = {
      query: hoursKey(query),
      status: hours ? 'found' : 'none',
      lat: null,
      lng: null,
      label: hours ? JSON.stringify(hours) : null,
      updated_at: new Date().toISOString(),
    };
    await sb.from('place_cache').upsert(row);
    return hours;
  } catch {
    // Places unavailable: skip for now.
    return undefined;
  }
}

/** Hours for every query we can answer, from place_cache (if recent enough) or one lookup each. */
async function findHours(queries: string[]): Promise<Found> {
  const sb = supabaseBrowser();
  const { data } = await sb
    .from('place_cache')
    .select('query,status,lat,lng,label,updated_at')
    .in('query', queries.map(hoursKey));
  const rows = new Map(((data ?? []) as Row[]).map((r) => [r.query, r]));

  const out: Found = {};
  for (const q of queries) {
    const row = rows.get(hoursKey(q));
    const fresh = !!row && Date.now() - Date.parse(row.updated_at) < REFRESH_MS;
    const cached = fresh && row ? fromRow(row) : undefined;
    if (cached !== undefined) {
      out[q] = cached;
      continue;
    }
    const hit = await lookupOne(sb, q);
    if (hit !== undefined) out[q] = hit;
  }
  return out;
}

const queriesFor = (day: Day) =>
  day.stops
    .map((s) => ({ key: s.key, query: placeQuery(s, cityForStop(day, s)) }))
    .filter((s): s is { key: string; query: string } => !!s.query);

async function fetchMissing(queries: string[]): Promise<Found> {
  const cached = (await readCached<Found>('hours')) ?? {};
  const todo = [...new Set(queries.filter((q) => !(q in cached)))];
  if (!todo.length || !navigator.onLine) return cached;
  const id = todo.join('|');
  if (!inflight.has(id))
    inflight.set(
      id,
      findHours(todo).finally(() => inflight.delete(id)),
    );
  const found = await inflight.get(id)!;
  const all = { ...((await readCached<Found>('hours')) ?? {}), ...found };
  await writeCached('hours', all);
  return all;
}

/** Forget a stop's hours, e.g. after its pin was moved with "Wrong spot?", so they're found again. */
export async function forgetHours(query: string): Promise<void> {
  const cached = (await readCached<Found>('hours')) ?? {};
  delete cached[query];
  await writeCached('hours', cached);
  await supabaseBrowser().from('place_cache').delete().eq('query', hoursKey(query));
}

/** Look up every day's opening hours once, in the background, so they're there offline. */
export async function warmHours(days: Day[]): Promise<void> {
  if (!navigator.onLine) return;
  for (const d of days) await fetchMissing(queriesFor(d).map((s) => s.query)).catch(() => null);
}

/**
 * Each stop's check against the place's opening hours at its planned time, keyed by stop key.
 * Stops whose hours aren't known are left out.
 */
export function useHours(day: Day): Map<string, { check: HoursCheck | null; today: string | null }> {
  const [found, setFound] = useState<Found>({});

  useEffect(() => {
    let cancelled = false;
    const queries = queriesFor(day).map((s) => s.query);
    if (!queries.length) return;

    (async () => {
      const cached = (await readCached<Found>('hours')) ?? {};
      if (!cancelled) setFound(cached);
      const all = await fetchMissing(queries);
      if (!cancelled) setFound(all);
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [day]);

  return useMemo(() => {
    const out = new Map<string, { check: HoursCheck | null; today: string | null }>();
    for (const s of day.stops) {
      const q = placeQuery(s, cityForStop(day, s));
      const h = q ? found[q] : null;
      if (!h) continue;
      out.set(s.key, {
        check: checkHours(h.p, day.isoDate, s.time, parseMinutes(s.duration)),
        today: hoursTodayText(h.w, day.isoDate),
      });
    }
    return out;
  }, [day, found]);
}
