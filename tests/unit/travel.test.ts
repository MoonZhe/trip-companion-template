import { describe, expect, it } from 'vitest';
import type { Day, Stop } from '@/lib/sheet/types';
import { dayEnd, leaveBy, leaveLabel, leaveTone, nextStopOf, parseMinutes } from '@/lib/trip/travel';

const stop = (over: Partial<Stop>): Stop => ({
  key: 'k',
  day: 1,
  date: '',
  time: '10:00',
  title: 'x',
  tips: '',
  duration: '',
  travelNext: '',
  costJpy: null,
  category: '',
  isOption: false,
  bookAhead: '',
  ...over,
});

describe('parseMinutes', () => {
  it.each([
    ['Nankai Rapi:t 38 min', 38],
    ['Metro back to Namba ~25 min', 25],
    ['1.75 hr', 105],
    ['2h 15min', 135],
    ['1h30min', 90],
    ['1hr30min', 90],
    ["JR San'in Line 15–20 min", 20],
    ['Walk 2 min + JR to Kyoto Stn 25 min', 27],
    ['Bus to Ryoan-ji ~30 min (or walk 15 min to Jojakko-ji if doing it)', 30],
    ['Walk 5 min (Isuien) or 15 min to Kintetsu Nara', 5],
    ['2+ hr', 120],
    ['1 hr', 60],
  ])('%s → %i', (text, mins) => expect(parseMinutes(text)).toBe(mins));

  it.each(['Walk', '—', '', 'Same building'])('%s → null', (text) => expect(parseMinutes(text)).toBeNull());
});

describe('leaveBy', () => {
  const from = stop({ time: '10:45', travelNext: 'Walk + metro to Namba ~25 min' });
  const to = stop({ time: '13:00' });
  it('counts back from the next stop', () => {
    expect(leaveBy(from, to, '12:20')).toEqual({ at: '12:35', travelMin: 25, inMin: 15 });
  });
  it('goes negative when late', () => {
    expect(leaveBy(from, to, '12:45')?.inMin).toBe(-10);
  });
  it('needs a travel time', () => {
    expect(leaveBy(stop({ travelNext: 'Walk' }), to, '12:00')).toBeNull();
  });
});

describe('leave tone and label', () => {
  it('escalates as time runs out', () => {
    expect(leaveTone(45)).toBe('relaxed');
    expect(leaveTone(15)).toBe('soon');
    expect(leaveTone(3)).toBe('now');
    expect(leaveTone(-8)).toBe('late');
  });
  it('reads naturally', () => {
    expect(leaveLabel({ at: '', travelMin: 0, inMin: 12 })).toBe('Leave in 12 min');
    expect(leaveLabel({ at: '', travelMin: 0, inMin: 75 })).toBe('Leave in 1 hr 15 min');
    expect(leaveLabel({ at: '', travelMin: 0, inMin: 60 })).toBe('Leave in 1 hr');
    expect(leaveLabel({ at: '', travelMin: 0, inMin: -6 })).toBe('6 min behind. Leave now');
  });
});

describe('dayEnd', () => {
  const day = (stops: Stop[]): Day => ({ day: 1, label: '', dateLabel: '', isoDate: '', city: 'TOKYO', stops });
  it('finds the last stop, end time and way home', () => {
    const e = dayEnd(
      day([
        stop({ time: '19:15' }),
        stop({ time: '20:45', duration: '2 hr', travelNext: 'JR Chuo Rapid direct to Kanda ~15 min' }),
        stop({ time: '12:00', isOption: true }),
      ]),
    );
    expect(e).toMatchObject({ endsAt: '22:45', travel: 'JR Chuo Rapid direct to Kanda ~15 min', late: true });
  });
  it('picks up a last-train line from the tips', () => {
    const e = dayEnd(day([stop({ time: '18:00', duration: '1 hr', tips: 'Dinner\n🚉 Last train: Ginza Line 00:02' })]));
    expect(e).toMatchObject({ lastTrain: 'Last train: Ginza Line 00:02', late: true });
  });
  it('is not late on an early night, and hides "—"', () => {
    expect(dayEnd(day([stop({ time: '18:30', duration: '1.5 hr', travelNext: '—' })]))).toMatchObject({
      late: false,
      travel: '',
    });
  });
});

describe('nextStopOf', () => {
  const a = stop({ key: 'a' });
  const b = stop({ key: 'b' });
  const optA = stop({ key: 'oa', isOption: true });
  const optB = stop({ key: 'ob', isOption: true });
  const c = stop({ key: 'c' });
  const day: Day = { day: 1, label: '', dateLabel: '', isoDate: '', city: 'OSAKA', stops: [a, b, optA, optB, c] };

  it('is the following stop', () => expect(nextStopOf(day, a)).toBe(b));
  it('is null when the way on is a pick-one choice', () => expect(nextStopOf(day, b)).toBeNull());
  it('skips the other options after a picked option', () => expect(nextStopOf(day, optA)).toBe(c));
  it('is the hotel after the last stop', () => expect(nextStopOf(day, c)).toBe('hotel'));
});
