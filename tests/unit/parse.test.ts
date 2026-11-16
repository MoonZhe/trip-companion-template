import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/sheet.json';
import { ITINERARY_ROWS, parseTrip, replacesSnapshot, stopKey, formatTime } from '@/lib/sheet/parse';
import { SheetFormatError, type RawSheet } from '@/lib/sheet/types';

const raw = fixture as RawSheet;
const clone = (): RawSheet => JSON.parse(JSON.stringify(raw));

describe('formatTime', () => {
  it('converts day fractions and passes through HH:MM', () => {
    expect(formatTime('0.4583333333333333')).toBe('11:00');
    expect(formatTime('0.9965277777777778')).toBe('23:55');
    expect(formatTime('09:50')).toBe('09:50');
    expect(formatTime('9:5')).toBe('09:05');
  });
});

describe('stopKey', () => {
  it('builds a stable slug', () => {
    expect(stopKey(3, '09:30', 'Sumiyoshi Taisha')).toBe('d3-0930-sumiyoshi-taisha');
    expect(stopKey(1, '11:00', 'Nankai Rapi:t → Namba')).toBe('d1-1100-nankai-rapi-t-namba');
  });
});

describe('parseTrip', () => {
  const trip = parseTrip(raw);

  it('parses 10 days with cities and ISO dates', () => {
    expect(trip.days).toHaveLength(10);
    expect(trip.days[0]).toMatchObject({ day: 1, city: 'OSAKA', isoDate: '2026-10-24' });
    expect(trip.days[9].isoDate).toBe('2026-11-02');
    expect(trip.days[0].stops[0]).toMatchObject({ time: '09:50', title: 'Arrive Osaka KIX' });
  });

  it('gives every stop a unique key', () => {
    const keys = trip.days.flatMap((d) => d.stops.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('marks Day 10 options', () => {
    expect(trip.days[9].stops.filter((s) => s.isOption)).toHaveLength(4);
  });

  it('parses costs and dashes', () => {
    const rapit = trip.days[0].stops.find((s) => s.title.startsWith('Nankai'));
    expect(rapit?.costJpy).toBe(2980);
    expect(trip.days[0].stops[0].costJpy).toBeNull();
  });

  it('parses rate, flights, hotels, budget and pre-payments', () => {
    expect(trip.jpyPerRm).toBeCloseTo(38.7);
    expect(trip.flights.map((f) => f.direction)).toEqual(['outbound', 'return']);
    expect(trip.flights[0].departure).toContain('02:20');
    expect(trip.hotels.map((h) => h.city)).toEqual(['OSAKA', 'KYOTO', 'TOKYO']);
    expect(trip.budget.length).toBeGreaterThan(30);
    expect(trip.budget.find((b) => b.section === 'FOOD')).toBeTruthy();
    expect(trip.prePayments.map((p) => p.type)).toEqual(['Flight', 'Flight', 'Hotel', 'Hotel', 'Hotel', 'Cash']);
    expect(trip.prePayments[5]).toMatchObject({ payer: 'sam', amountRm: 2000 });
  });

  it('is unaffected by column order', () => {
    const r = clone();
    r.itinerary = r.itinerary.map((row) => {
      const x = [...row];
      [x[3], x[4]] = [x[4] ?? '', x[3] ?? ''];
      return x;
    });
    expect(parseTrip(r).days).toEqual(trip.days);
  });

  it('reads the optional "Book in advance?" column by substring, blank when absent', () => {
    expect(trip.days[0].stops.every((s) => s.bookAhead === '')).toBe(true);
    const r = clone();
    const width = Math.max(...r.itinerary.map((row) => row.length));
    r.itinerary = r.itinerary.map((row) => [...row, ...Array(width - row.length).fill(''), '']);
    r.itinerary[1][width] = '🎟 Book in advance? (not food; blank = nothing to book)';
    r.itinerary[4][width] = 'Optional: e-ticket skips the queue';
    const stops = parseTrip(r).days[0].stops;
    expect(stops[0].bookAhead).toBe('Optional: e-ticket skips the queue');
    expect(stops[1].bookAhead).toBe('');
  });

  it('throws when a required header is missing', () => {
    const r = clone();
    r.itinerary[1] = r.itinerary[1].map((h) => (h === 'Time' ? 'Hmm' : h));
    expect(() => parseTrip(r)).toThrow(SheetFormatError);
  });

  it('skips a malformed row with a warning', () => {
    const r = clone();
    r.itinerary[5] = [...r.itinerary[5]];
    r.itinerary[5][0] = 'x';
    const t = parseTrip(r);
    expect(t.days[0].stops).toHaveLength(trip.days[0].stops.length - 1);
    expect(t.warnings.length).toBeGreaterThan(0);
  });

  it('throws instead of returning an empty plan when no day header matches', () => {
    const r = clone();
    r.itinerary = r.itinerary.map((row) => (/DAY\s*\d/.test(row[0] ?? '') ? [row[0].replace(/·/g, '-'), ...row.slice(1)] : row));
    expect(() => parseTrip(r)).toThrow(SheetFormatError);
  });

  it('throws when a day header has a date it cannot read', () => {
    const r = clone();
    const i = r.itinerary.findIndex((row) => /DAY\s*2\s/.test(row[0] ?? ''));
    r.itinerary[i] = [r.itinerary[i][0].replace(/\d{1,2} [A-Za-z]{3}/, '25/10'), ...r.itinerary[i].slice(1)];
    expect(() => parseTrip(r)).toThrow(SheetFormatError);
  });

  it('warns when the itinerary fills every row the app reads', () => {
    expect(trip.warnings.some((w) => w.includes('rows'))).toBe(false);
    const r = clone();
    r.itinerary = [...r.itinerary, ...Array(ITINERARY_ROWS - r.itinerary.length).fill([''])];
    expect(parseTrip(r).warnings.some((w) => w.includes(`${ITINERARY_ROWS} rows`))).toBe(true);
  });
});

describe('replacesSnapshot', () => {
  const trip = parseTrip(raw);

  it('saves when there is no snapshot or the plan is about the same size', () => {
    expect(replacesSnapshot(trip, null)).toBe(true);
    expect(replacesSnapshot(trip, trip)).toBe(true);
    const fewer = { days: trip.days.map((d, i) => (i === 0 ? { ...d, stops: d.stops.slice(1) } : d)) };
    expect(replacesSnapshot(fewer, trip)).toBe(true);
  });

  it('keeps the snapshot when over half the stops vanished', () => {
    const halved = { days: trip.days.slice(0, 3) };
    expect(replacesSnapshot(halved, trip)).toBe(false);
  });
});
