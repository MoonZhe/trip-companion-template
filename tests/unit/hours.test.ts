import { describe, expect, it } from 'vitest';
import { checkHours, hoursTodayText, hoursWarning, type Period } from '@/lib/trip/hours';

// Week-minutes helper: day 0 = Sunday.
const at = (day: number, hh: number, mm = 0) => day * 1440 + hh * 60 + mm;
const MON = '2026-10-12';
const TUE = '2026-10-13';
const FRI = '2026-10-16';
const SAT = '2026-10-17';
const SUN = '2026-10-18';

const nine5: Period[] = [{ open: at(1, 9), close: at(1, 17) }];

describe('checkHours', () => {
  it('returns null without periods or a usable time', () => {
    expect(checkHours([], MON, '10:00', 60)).toBeNull();
    expect(checkHours(nine5, MON, 'TBD', 60)).toBeNull();
    expect(checkHours(nine5, MON, '', 60)).toBeNull();
  });

  it('is ok for a place open 24/7', () => {
    const always: Period[] = [{ open: 0, close: null }];
    expect(checkHours(always, MON, '03:00', 600)).toEqual({ kind: 'ok' });
    expect(checkHours(always, SUN, '23:59', null)).toEqual({ kind: 'ok' });
  });

  it('is ok inside opening hours', () => {
    expect(checkHours(nine5, MON, '10:00', 60)).toEqual({ kind: 'ok' });
    expect(checkHours(nine5, MON, '16:30', null)).toEqual({ kind: 'ok' });
    expect(checkHours(nine5, MON, '16:30', 30)).toEqual({ kind: 'ok' });
  });

  it('warns when the visit runs past closing', () => {
    expect(checkHours(nine5, MON, '16:30', 60)).toEqual({ kind: 'closes-early', closes: '17:00' });
    expect(checkHours(nine5, MON, '16:30', 31)).toEqual({ kind: 'closes-early', closes: '17:00' });
  });

  it('says when it opens if the visit is before opening', () => {
    expect(checkHours(nine5, MON, '08:00', 60)).toEqual({ kind: 'not-open', opens: '09:00' });
  });

  it('says when it closed if the visit is after closing', () => {
    expect(checkHours(nine5, MON, '18:00', 60)).toEqual({ kind: 'closed-by-then', closed: '17:00' });
  });

  it('is closed on a day with no periods', () => {
    expect(checkHours(nine5, TUE, '10:00', 60)).toEqual({ kind: 'closed-day', weekday: 'Tuesday' });
    expect(checkHours(nine5, SUN, '10:00', 60)).toEqual({ kind: 'closed-day', weekday: 'Sunday' });
  });

  it('handles a lunch break gap', () => {
    const lunch: Period[] = [
      { open: at(1, 10), close: at(1, 12) },
      { open: at(1, 13), close: at(1, 18) },
    ];
    expect(checkHours(lunch, MON, '12:30', 30)).toEqual({ kind: 'not-open', opens: '13:00' });
    expect(checkHours(lunch, MON, '11:30', 60)).toEqual({ kind: 'closes-early', closes: '12:00' });
    expect(checkHours(lunch, MON, '13:30', 60)).toEqual({ kind: 'ok' });
    expect(checkHours(lunch, MON, '19:00', 60)).toEqual({ kind: 'closed-by-then', closed: '18:00' });
  });

  it('picks the earliest later opening', () => {
    const split: Period[] = [
      { open: at(1, 15), close: at(1, 16) },
      { open: at(1, 11), close: at(1, 12) },
    ];
    expect(checkHours(split, MON, '09:00', 30)).toEqual({ kind: 'not-open', opens: '11:00' });
  });

  it('handles an overnight bar that runs past midnight', () => {
    const bar: Period[] = [{ open: at(5, 18), close: at(6, 2) }]; // Fri 18:00 to Sat 02:00
    expect(checkHours(bar, FRI, '23:00', 60)).toEqual({ kind: 'ok' });
    expect(checkHours(bar, SAT, '01:00', 30)).toEqual({ kind: 'ok' });
    expect(checkHours(bar, SAT, '01:30', 60)).toEqual({ kind: 'closes-early', closes: '02:00' });
  });

  it('handles an overnight bar that runs past Saturday into Sunday', () => {
    const bar: Period[] = [{ open: at(6, 22), close: at(0, 2) }]; // Sat 22:00 to Sun 02:00
    expect(checkHours(bar, SAT, '23:00', 60)).toEqual({ kind: 'ok' });
    expect(checkHours(bar, SUN, '01:00', 30)).toEqual({ kind: 'ok' });
    expect(checkHours(bar, SUN, '01:30', 60)).toEqual({ kind: 'closes-early', closes: '02:00' });
  });

  it('does not count a duration as an overrun when none is known', () => {
    expect(checkHours(nine5, MON, '16:59', null)).toEqual({ kind: 'ok' });
  });
});

describe('hoursTodayText', () => {
  const week = [
    'Monday: 9:00 AM – 5:00 PM',
    'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: Closed',
    'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM',
    'Saturday: 10:00 AM – 9:00 PM',
    'Sunday: 10:00 AM – 6:00 PM',
  ];

  it('returns the hours for the date weekday', () => {
    expect(hoursTodayText(week, MON)).toBe('9:00 AM – 5:00 PM');
    expect(hoursTodayText(week, SAT)).toBe('10:00 AM – 9:00 PM');
    expect(hoursTodayText(week, SUN)).toBe('10:00 AM – 6:00 PM');
    expect(hoursTodayText(week, '2026-10-14')).toBe('Closed');
  });

  it('returns null without descriptions', () => {
    expect(hoursTodayText([], MON)).toBeNull();
  });
});

describe('hoursWarning', () => {
  it('words each warning', () => {
    expect(hoursWarning({ kind: 'closed-day', weekday: 'Monday' })).toBe('Closed on Mondays');
    expect(hoursWarning({ kind: 'not-open', opens: '11:00' })).toBe('Opens 11:00');
    expect(hoursWarning({ kind: 'closed-by-then', closed: '17:00' })).toBe('Closed by then (17:00)');
    expect(hoursWarning({ kind: 'closes-early', closes: '17:00' })).toBe('Closes 17:00');
    expect(hoursWarning({ kind: 'ok' })).toBeNull();
  });
});
