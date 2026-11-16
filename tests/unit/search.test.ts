import { describe, expect, it } from 'vitest';
import { fold, search, terms } from '@/lib/search/search';

const stops = [
  { title: 'Lunch: Kawakatsu 川勝 (unagi)', tips: 'Edo-style unagi.\n⚠️ Closed Saturdays; Monday is fine.' },
  { title: 'Dinner: Sushi-Kin すし金 (Whity Umeda)', tips: 'Casual sushi izakaya.\n🔄 Flexible: Tempura Makino (Hankyu Sanbangai South 2F)' },
  { title: 'Tempura Makino', tips: '' },
];
const fields = (s: (typeof stops)[number]) => [s.title, s.tips];

describe('fold', () => {
  it('ignores case, accents, full-width letters and katakana vs hiragana', () => {
    expect(fold('Café ＵＭＥＤＡ')).toBe('cafe umeda');
    expect(fold('スシ')).toBe(fold('すし'));
  });
});

describe('terms', () => {
  it('waits for two Latin letters, but takes one Japanese character', () => {
    expect(terms('u')).toEqual([]);
    expect(terms('金')).toEqual(['金']);
    expect(terms('  Sushi  KIN ')).toEqual(['sushi', 'kin']);
  });
});

describe('search', () => {
  it('needs every word, anywhere in the item', () => {
    expect(search(stops, 'unagi monday', fields).map((h) => h.item)).toEqual([stops[0]]);
    expect(search(stops, 'unagi tempura', fields)).toEqual([]);
  });

  it('ranks title hits above tips hits', () => {
    expect(search(stops, 'makino', fields).map((h) => h.item.title)).toEqual(['Tempura Makino', stops[1].title]);
  });

  it('matches Japanese in either script', () => {
    expect(search(stops, 'スシ', fields).map((h) => h.item)).toEqual([stops[1]]);
  });

  it('gives a snippet from the matching line when the title has no hit', () => {
    const [hit] = search(stops, 'saturdays', fields);
    expect(hit.snippet).toEqual({ before: '⚠️ Closed ', hit: 'Saturdays', after: '; Monday is fine.' });
    expect(search(stops, 'kawakatsu', fields)[0].snippet).toBeNull();
  });

  it('cuts long lines around the hit', () => {
    const long = { title: 'x', tips: `${'a'.repeat(60)} needle ${'b'.repeat(60)}` };
    const [hit] = search([long], 'needle', (s) => [s.title, s.tips]);
    expect(hit.snippet!.before.startsWith('…')).toBe(true);
    expect(hit.snippet!.after.endsWith('…')).toBe(true);
    expect(hit.snippet!.hit).toBe('needle');
  });
});
