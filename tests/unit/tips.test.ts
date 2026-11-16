import { describe, expect, it } from 'vitest';
import { parseTips, pinOf, pinQuery } from '@/lib/trip/tips';

describe('parseTips', () => {
  it('splits a summary line from icon points', () => {
    const t = parseTips(
      'Kinkaku-ji, the Golden Pavilion.\n⭐ The pond reflection is the shot.\n⚠️ Closes 17:00.\n🔄 Flexible: eat nearby.',
    );
    expect(t.lead).toBe('Kinkaku-ji, the Golden Pavilion.');
    expect(t.points).toEqual([
      { icon: '⭐', text: 'The pond reflection is the shot.' },
      { icon: '⚠️', text: 'Closes 17:00.' },
      { icon: '🔄', text: 'Flexible: eat nearby.' },
    ]);
  });

  it('keeps an old single-paragraph cell as the lead', () => {
    expect(parseTips('Konbini or hotel.')).toEqual({ lead: 'Konbini or hotel.', points: [] });
    expect(parseTips('')).toEqual({ lead: '', points: [] });
  });

  it('treats bullets and plain lines as icon-less points, and skips blank lines', () => {
    const t = parseTips('Summary\n\n• bullet line\nplain line');
    expect(t.points).toEqual([
      { icon: null, text: 'bullet line' },
      { icon: null, text: 'plain line' },
    ]);
  });

  it('handles multi-codepoint emoji', () => {
    expect(parseTips('x\n🛂 Stamp').points[0]).toEqual({ icon: '🛂', text: 'Stamp' });
    expect(parseTips('x\n🗻 Fuji').points[0].icon).toBe('🗻');
  });
});

describe('pinOf / pinQuery', () => {
  const tips = 'A quick 3COINS stop.\n📍 3COINS Namba CITY, Osaka\n⭐ Glico sign.';
  it('reads the 📍 line', () => {
    expect(pinOf(tips)).toEqual({ text: '3COINS Namba CITY, Osaka', url: null });
    expect(pinQuery(tips)).toBe('3COINS Namba CITY, Osaka, Japan');
  });
  it('keeps a Maps link as a link', () => {
    const link = 'x\n📍 https://maps.app.goo.gl/abc123';
    expect(pinOf(link)).toEqual({ text: 'https://maps.app.goo.gl/abc123', url: 'https://maps.app.goo.gl/abc123' });
    expect(pinQuery(link)).toBeNull();
  });
  it('is null without a 📍 line', () => expect(pinOf('Lead\n⭐ thing')).toBeNull());
});
