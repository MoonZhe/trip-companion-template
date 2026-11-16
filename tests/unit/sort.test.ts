import { describe, expect, it } from 'vitest';
import { SORT_GAP, sortUpdates } from '@/lib/list/sort';

const items = (...sorts: number[]) => sorts.map((sort, i) => ({ id: String.fromCharCode(97 + i), sort }));

describe('sortUpdates', () => {
  it('moves one item between its neighbours with a single write', () => {
    expect(sortUpdates(items(1024, 2048, 3072, 4096), ['a', 'c', 'b', 'd'], 'c')).toEqual([{ id: 'c', sort: 1536 }]);
  });
  it('handles the top and bottom', () => {
    expect(sortUpdates(items(1024, 2048, 3072), ['c', 'a', 'b'], 'c')).toEqual([{ id: 'c', sort: 1024 - SORT_GAP }]);
    expect(sortUpdates(items(1024, 2048, 3072), ['b', 'c', 'a'], 'a')).toEqual([{ id: 'a', sort: 3072 + SORT_GAP }]);
  });
  it('spaces the list out once when there is no room (old 1, 2, 3 numbering)', () => {
    const out = sortUpdates(items(1, 2, 3), ['a', 'c', 'b'], 'c');
    expect(out).toEqual([
      { id: 'a', sort: 1024 },
      { id: 'c', sort: 2048 },
      { id: 'b', sort: 3072 },
    ]);
  });
  it('writes nothing when the item did not really move', () => {
    expect(sortUpdates(items(5), ['a'], 'a')).toEqual([]);
  });
  it('spaces the list out rather than tie with an item shown out of stored order', () => {
    // b is found, so it shows below c although stored above it: a dropped under b would tie c (3072).
    const out = sortUpdates(items(1024, 2048, 3072), ['c', 'b', 'a'], 'a');
    expect(out).toEqual([
      { id: 'c', sort: 1024 },
      { id: 'a', sort: 3072 },
    ]);
  });
});
