import { describe, expect, it } from 'vitest';
import { cleanUrl, foundCount, foundLast, hostOf, joinLinks, linksOf, photoCheckKey, photosFor } from '@/lib/list/wish';

const f = (id: string, wish_id: string | null, created_at: string, kind = 'wish') => ({ id, kind, wish_id, created_at });

describe('photosFor', () => {
  it('returns only this item’s wish photos, oldest first', () => {
    const files = [
      f('b', 'w1', '2026-10-12T10:00:02Z'),
      f('x', 'w2', '2026-10-12T10:00:00Z'),
      f('a', 'w1', '2026-10-12T10:00:01Z'),
      f('t', null, '2026-10-12T09:00:00Z', 'ticket'),
    ];
    expect(photosFor(files, 'w1').map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('foundCount', () => {
  it('counts ticked photos', () => {
    const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(foundCount(photos, new Set([photoCheckKey('a'), photoCheckKey('c'), 'wish:a']))).toEqual({ found: 2, total: 3 });
    expect(foundCount([], new Set())).toEqual({ found: 0, total: 0 });
  });
});

describe('cleanUrl', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['casio.com/watches', 'https://casio.com/watches'],
    [' https://www.yodobashi.com/product/1 ', 'https://www.yodobashi.com/product/1'],
    ['http://example.jp', 'http://example.jp/'],
    ['javascript:alert(1)', null],
    ['ftp://x.com', null],
    ['not a url', null],
    ['hello', null],
  ])('%j → %j', (raw, out) => expect(cleanUrl(raw)).toBe(out));
});

describe('hostOf', () => {
  it('drops www.', () => expect(hostOf('https://www.yodobashi.com/p/1')).toBe('yodobashi.com'));
});

describe('foundLast', () => {
  it('moves found ids to the end, keeping order in each group', () => {
    const found = new Set(['b', 'd']);
    expect(foundLast(['a', 'b', 'c', 'd', 'e'], (id) => found.has(id))).toEqual(['a', 'c', 'e', 'b', 'd']);
  });
});

describe('linksOf / joinLinks', () => {
  it('reads an old single link', () => expect(linksOf('https://a.com/')).toEqual(['https://a.com/']));
  it('reads one link per line, skipping blanks', () =>
    expect(linksOf('https://a.com/\n\n https://b.com/ ')).toEqual(['https://a.com/', 'https://b.com/']));
  it('reads nothing from null', () => expect(linksOf(null)).toEqual([]));
  it('drops links that are not http(s)', () =>
    expect(linksOf('javascript:alert(1)\nhttps://a.com/\ndata:text/html,x')).toEqual(['https://a.com/']));
  it('joins, dropping duplicates', () =>
    expect(joinLinks(['https://a.com/', 'https://b.com/', 'https://a.com/'])).toBe('https://a.com/\nhttps://b.com/'));
  it('is null when empty', () => expect(joinLinks([])).toBeNull());
});
