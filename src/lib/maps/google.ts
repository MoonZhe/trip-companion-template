'use client';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { SupabaseClient } from '@supabase/supabase-js';

let configured = false;

export async function loadMaps() {
  if (!configured) {
    setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!, v: 'weekly', language: 'en', region: 'JP' });
    configured = true;
  }
  const [maps] = await Promise.all([importLibrary('maps'), importLibrary('places'), importLibrary('geocoding')]);
  return maps;
}

export interface Place {
  query: string;
  status: 'found' | 'none' | 'manual';
  lat: number | null;
  lng: number | null;
  label: string | null;
}

/**
 * Look a place up with Places (New), falling back to the Geocoding API. Null when the search
 * answered with no match; undefined when it couldn't be asked (offline, quota, key), so callers
 * don't remember a miss that was really a dropped connection.
 */
export async function searchPlace(textQuery: string): Promise<Omit<Place, 'query' | 'status'> | null | undefined> {
  let answered = false;
  try {
    const { places } = await google.maps.places.Place.searchByText({
      textQuery,
      fields: ['location', 'displayName'],
      maxResultCount: 1,
    });
    answered = true;
    const p = places[0];
    if (p?.location) return { lat: p.location.lat(), lng: p.location.lng(), label: p.displayName ?? null };
  } catch {
    // Places (New) not available on this key: try geocoding instead.
  }
  try {
    const { results } = await new google.maps.Geocoder().geocode({ address: textQuery });
    answered = true;
    const r = results[0];
    if (r) return { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), label: r.formatted_address };
  } catch (e) {
    // The geocoder rejects a plain "no match" too; that one is a real answer.
    if ((e as { code?: string })?.code === 'ZERO_RESULTS') answered = true;
  }
  return answered ? null : undefined;
}

/**
 * Coordinates for each query. Cached rows come from Supabase; anything new is looked up
 * once (one at a time, to stay well inside the daily quota) and saved for both phones. A query
 * that couldn't be looked up (offline, a failed search) is left out of the result.
 */
export async function resolvePlaces(sb: SupabaseClient, queries: string[]): Promise<Map<string, Place>> {
  const unique = [...new Set(queries)];
  const out = new Map<string, Place>();
  if (!unique.length) return out;

  // An unreadable cache (offline) is an error, not "nothing pinned yet": searching everything again
  // would fail too and leave the map with no pins.
  const { data, error } = await sb.from('place_cache').select('query,status,lat,lng,label').in('query', unique);
  if (error) throw error;
  for (const row of (data ?? []) as Place[]) out.set(row.query, row);

  for (const query of unique.filter((q) => !out.has(q))) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) break;
    const hit = await searchPlace(query);
    // A failed search is left out and uncached, so it's tried again next time.
    if (hit === undefined) continue;
    const row: Place = hit ? { query, status: 'found', ...hit } : { query, status: 'none', lat: null, lng: null, label: null };
    out.set(query, row);
    await sb.from('place_cache').upsert({ ...row, updated_at: new Date().toISOString() });
  }
  return out;
}

/** "Wrong spot?": search with better words and pin the result to the original query. */
export async function correctPlace(sb: SupabaseClient, query: string, betterSearch: string): Promise<Place | null> {
  const hit = await searchPlace(betterSearch);
  if (!hit) return null;
  const row: Place = { query, status: 'manual', ...hit };
  await sb.from('place_cache').upsert({ ...row, updated_at: new Date().toISOString() });
  return row;
}
