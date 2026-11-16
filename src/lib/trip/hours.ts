import { fromMinutes, toMinutes } from './travel';

/** An opening interval in week-minutes (Sunday 00:00 = 0). `close` null = never closes. */
export interface Period {
  open: number;
  close: number | null;
}

export type HoursCheck =
  | { kind: 'ok' }
  | { kind: 'closed-day'; weekday: string }
  | { kind: 'not-open'; opens: string }
  | { kind: 'closed-by-then'; closed: string }
  | { kind: 'closes-early'; closes: string };

const DAY = 1440;
const WEEK = 7 * DAY;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Whether a visit starting at `time` on `isoDate` (lasting `durationMin`) fits the opening hours. */
export function checkHours(
  periods: Period[],
  isoDate: string,
  time: string,
  durationMin: number | null,
): HoursCheck | null {
  if (!periods.length || !/^\d{1,2}:\d{2}/.test(time)) return null;
  if (periods.length === 1 && periods[0].open === 0 && periods[0].close === null) return { kind: 'ok' };

  const wd = new Date(isoDate + 'T00:00:00Z').getUTCDay();
  const dayStart = wd * DAY;
  const start = dayStart + toMinutes(time);
  const dur = durationMin ?? 0;

  // Intervals as [o, c), with c pushed past the week end when it wraps past Saturday.
  const intervals = periods.map((p) => {
    const o = p.open;
    let c = p.close ?? o + WEEK;
    if (c <= o) c += WEEK;
    return { o, c };
  });

  // Inside an opening interval (this week, or the wrapped copy for Sunday-morning visits).
  for (const shift of [0, WEEK]) {
    const x = start + shift;
    const hit = intervals.find((iv) => iv.o <= x && x < iv.c);
    if (hit) {
      if (durationMin && x + dur > hit.c) return { kind: 'closes-early', closes: fromMinutes(hit.c) };
      return { kind: 'ok' };
    }
  }

  // Closed right now: what's left of this calendar day?
  const sameDay = intervals.filter((iv) => {
    const om = iv.o % WEEK;
    return om >= dayStart && om < dayStart + DAY;
  });
  const later = sameDay.filter((iv) => iv.o % WEEK > start).sort((a, b) => (a.o % WEEK) - (b.o % WEEK));
  if (later.length) return { kind: 'not-open', opens: fromMinutes(later[0].o % WEEK) };
  if (sameDay.length) {
    const closed = Math.max(...sameDay.map((iv) => iv.c));
    return { kind: 'closed-by-then', closed: fromMinutes(closed) };
  }
  return { kind: 'closed-day', weekday: WEEKDAYS[wd] };
}

/** Google's weekday lines (starting Monday) for the day of `isoDate`, without the day name. */
export function hoursTodayText(weekdayDescriptions: string[], isoDate: string): string | null {
  const wd = new Date(isoDate + 'T00:00:00Z').getUTCDay();
  const line = weekdayDescriptions[(wd + 6) % 7];
  if (!line) return null;
  const i = line.indexOf(': ');
  return i === -1 ? line : line.slice(i + 2);
}

/** A short warning for a visit that won't fit the opening hours, or null when it's fine. */
export function hoursWarning(c: HoursCheck): string | null {
  switch (c.kind) {
    case 'closed-day':
      return `Closed on ${c.weekday}s`;
    case 'not-open':
      return `Opens ${c.opens}`;
    case 'closed-by-then':
      return `Closed by then (${c.closed})`;
    case 'closes-early':
      return `Closes ${c.closes}`;
    case 'ok':
      return null;
  }
}
