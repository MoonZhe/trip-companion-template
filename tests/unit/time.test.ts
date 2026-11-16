import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/sheet.json';
import { parseTrip } from '@/lib/sheet/parse';
import type { RawSheet } from '@/lib/sheet/types';
import { nowNext, tokyoClock, tripClock, tripDayIndex } from '@/lib/time/now';

const trip = parseTrip(fixture as RawSheet);
const at = (iso: string) => new Date(iso);

describe('tokyoClock', () => {
  it('reports date and HH:MM in Asia/Tokyo', () => {
    expect(tokyoClock(at('2026-10-28T01:00:00Z'))).toEqual({ isoDate: '2026-10-28', hhmm: '10:00' });
    expect(tokyoClock(at('2026-10-27T16:30:00Z'))).toEqual({ isoDate: '2026-10-28', hhmm: '01:30' });
  });
});

describe('tripClock', () => {
  it('keeps the night on the day it started until 04:00', () => {
    expect(tripClock(at('2026-10-29T00:20:00+09:00'))).toEqual({ isoDate: '2026-10-28', hhmm: '24:20' });
    expect(tripClock(at('2026-10-29T03:59:00+09:00'))).toEqual({ isoDate: '2026-10-28', hhmm: '27:59' });
    expect(tripClock(at('2026-10-29T04:00:00+09:00'))).toEqual({ isoDate: '2026-10-29', hhmm: '04:00' });
  });
});

describe('tripDayIndex', () => {
  it('rolls over at 04:00, like Add expense', () => {
    expect(tripDayIndex(trip.days, at('2026-10-29T01:30:00+09:00'))).toBe(4);
    expect(tripDayIndex(trip.days, at('2026-10-29T04:30:00+09:00'))).toBe(5);
  });
  it('finds the day or before/after', () => {
    expect(tripDayIndex(trip.days, at('2026-10-28T10:00:00+09:00'))).toBe(4);
    expect(tripDayIndex(trip.days, at('2026-10-01T10:00:00+09:00'))).toBe('before');
    expect(tripDayIndex(trip.days, at('2026-11-04T10:00:00+09:00'))).toBe('after');
  });
});

describe('nowNext', () => {
  const day5 = trip.days[4];
  it('picks the current and next stop', () => {
    const r = nowNext(day5, at('2026-10-28T10:00:00+09:00'));
    expect(r.now?.title).toMatch(/Tenryu-ji/);
    expect(r.next?.title).toMatch(/Jojakko-ji/);
  });
  it('before the first stop there is no current stop', () => {
    const r = nowNext(day5, at('2026-10-28T06:00:00+09:00'));
    expect(r.now).toBeNull();
    expect(r.next?.time).toBe('07:00');
  });
  it('moves on once the current stop is ticked', () => {
    const base = nowNext(day5, at('2026-10-28T10:00:00+09:00'));
    const r = nowNext(day5, at('2026-10-28T10:00:00+09:00'), new Set([base.now!.key]));
    expect(r.now).toBeNull();
    expect(r.next?.title).toMatch(/Jojakko-ji/);
    expect(r.from?.title).toMatch(/Tenryu-ji/);
  });
  it('skips a skipped stop', () => {
    const base = nowNext(day5, at('2026-10-28T10:00:00+09:00'));
    const r = nowNext(day5, at('2026-10-28T10:00:00+09:00'), new Set([`skip:${base.next!.key}`]));
    expect(r.now?.title).toMatch(/Tenryu-ji/);
    expect(r.next?.key).not.toBe(base.next!.key);
  });
  it('an unticked current stop stays current', () => {
    const r = nowNext(day5, at('2026-10-28T10:00:00+09:00'), new Set());
    expect(r.now?.title).toMatch(/Tenryu-ji/);
    expect(r.from).toBeNull();
  });
  it('after midnight the late stop is still current', () => {
    const r = nowNext(day5, at('2026-10-29T00:30:00+09:00'));
    expect(r.now?.title).toMatch(/Dinner in Kameoka/);
    expect(r.next).toBeNull();
  });
  it('the picked Day 10 option takes the place of the set', () => {
    const day10 = trip.days[9];
    const b = day10.stops.find((s) => s.title.includes('[Option B]'))!;
    const breakfast = day10.stops[0];
    const picked = new Set([`choice-d10:${b.key}`]);
    expect(nowNext(day10, at('2026-11-02T10:30:00+09:00'), picked).now?.key).toBe(b.key);
    const r = nowNext(day10, at('2026-11-02T09:00:00+09:00'), new Set([...picked, breakfast.key]));
    expect(r.next?.key).toBe(b.key);
    expect(r.from?.key).toBe(breakfast.key);
  });
  it('skips Day 10 option rows', () => {
    const r = nowNext(trip.days[9], at('2026-11-02T10:30:00+09:00'));
    expect(r.now?.isOption).toBe(false);
    expect(r.next?.isOption).toBe(false);
  });
});
