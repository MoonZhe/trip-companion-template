import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePlaces, searchPlace, type Place } from '@/lib/maps/google';

// A pretend place_cache: `rows` are what the select returns, `saved` collects upserts.
function fakeSb(rows: Place[], selectError: unknown = null) {
  const saved: Place[] = [];
  const sb = {
    from: () => ({
      select: () => ({ in: async () => ({ data: selectError ? null : rows, error: selectError }) }),
      upsert: async (row: Place) => {
        saved.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { sb, saved };
}

const at = (lat: number, lng: number) => ({ lat: () => lat, lng: () => lng });

function fakeGoogle(searchByText: () => Promise<unknown>, geocode: () => Promise<unknown>) {
  vi.stubGlobal('google', {
    maps: {
      places: { Place: { searchByText } },
      Geocoder: class {
        geocode = geocode;
      },
    },
  });
}

const offlineError = () => Promise.reject(new Error('network'));

beforeEach(() => vi.stubGlobal('navigator', { onLine: true }));
afterEach(() => vi.unstubAllGlobals());

describe('searchPlace', () => {
  it('finds a place with Places (New)', async () => {
    fakeGoogle(async () => ({ places: [{ location: at(34.6, 135.5), displayName: 'Kuromon' }] }), offlineError);
    expect(await searchPlace('Kuromon, Osaka, Japan')).toEqual({ lat: 34.6, lng: 135.5, label: 'Kuromon' });
  });

  it('tells a real miss (null) from a failed search (undefined)', async () => {
    fakeGoogle(
      async () => ({ places: [] }),
      async () => ({ results: [] }),
    );
    expect(await searchPlace('Nowhere')).toBeNull();

    fakeGoogle(offlineError, () => Promise.reject(Object.assign(new Error('none'), { code: 'ZERO_RESULTS' })));
    expect(await searchPlace('Nowhere')).toBeNull();

    fakeGoogle(offlineError, offlineError);
    expect(await searchPlace('Kuromon')).toBeUndefined();
  });
});

describe('resolvePlaces', () => {
  it('does not cache a miss when the search failed', async () => {
    fakeGoogle(offlineError, offlineError);
    const { sb, saved } = fakeSb([]);
    const out = await resolvePlaces(sb, ['Kuromon, Osaka, Japan']);
    expect(out.size).toBe(0);
    expect(saved).toEqual([]);
  });

  it('caches a real miss as none', async () => {
    fakeGoogle(
      async () => ({ places: [] }),
      async () => ({ results: [] }),
    );
    const { sb, saved } = fakeSb([]);
    const out = await resolvePlaces(sb, ['Nowhere, Osaka, Japan']);
    expect(out.get('Nowhere, Osaka, Japan')?.status).toBe('none');
    expect(saved.map((r) => r.status)).toEqual(['none']);
  });

  it('throws when place_cache cannot be read, rather than searching everything again', async () => {
    const search = vi.fn(offlineError);
    fakeGoogle(search, offlineError);
    const { sb } = fakeSb([], new Error('offline'));
    await expect(resolvePlaces(sb, ['Kuromon, Osaka, Japan'])).rejects.toThrow('offline');
    expect(search).not.toHaveBeenCalled();
  });

  it('returns cached rows and skips searching while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const search = vi.fn(offlineError);
    fakeGoogle(search, offlineError);
    const cached: Place = { query: 'A, Osaka, Japan', status: 'found', lat: 1, lng: 2, label: 'A' };
    const { sb, saved } = fakeSb([cached]);
    const out = await resolvePlaces(sb, ['A, Osaka, Japan', 'B, Osaka, Japan']);
    expect([...out.keys()]).toEqual(['A, Osaka, Japan']);
    expect(search).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });
});
