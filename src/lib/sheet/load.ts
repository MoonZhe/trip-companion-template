import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRawSheet } from './client';
import { parseTrip, replacesSnapshot } from './parse';
import type { Trip } from './types';

const TAG = 'trip';

async function fetchTrip(): Promise<Trip> {
  return parseTrip(await fetchRawSheet());
}

const cachedTrip = unstable_cache(fetchTrip, ['trip-v1'], { tags: [TAG], revalidate: 300 });

/**
 * Sheet is the source of truth. Reads are cached for 5 minutes; `fresh` bypasses the cache.
 * Every newly fetched copy is saved to `sheet_snapshot`, which is served if the sheet
 * can't be read or its format changed.
 */
export async function loadTrip(supabase: SupabaseClient, { fresh = false } = {}): Promise<Trip> {
  try {
    let trip: Trip;
    if (fresh) {
      trip = await fetchTrip();
      revalidateTag(TAG, { expire: 0 });
    } else {
      trip = await cachedTrip();
    }
    if (Date.now() - Date.parse(trip.fetchedAt) < 15_000) {
      const { data: saved } = await supabase.from('sheet_snapshot').select('data').eq('id', 1).maybeSingle();
      if (replacesSnapshot(trip, saved?.data as Trip | undefined)) {
        await supabase.from('sheet_snapshot').upsert({ id: 1, data: trip, fetched_at: trip.fetchedAt });
      } else {
        console.warn('[trip] fewer than half the saved stops; keeping the saved snapshot');
      }
    }
    return trip;
  } catch (err) {
    console.error('[trip] sheet load failed', err);
    const { data } = await supabase.from('sheet_snapshot').select('data').eq('id', 1).maybeSingle();
    if (!data) throw err;
    const saved = data.data as Trip;
    return { ...saved, warnings: [...saved.warnings, 'Showing saved version · the sheet could not be read'] };
  }
}
