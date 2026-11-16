import { TRIP } from '@/trip.config';
import { skipKey } from '@/lib/trip/skip';
import type { Day, Stop } from '@/lib/sheet/types';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRIP.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Wall-clock date and time in Japan, regardless of the phone's timezone. */
export function tokyoClock(now: Date = new Date()): { isoDate: string; hhmm: string } {
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { isoDate: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}

/**
 * The trip's clock: the day rolls over at 04:00, not midnight, so a late night still belongs to the
 * day it started on (the same rule Add expense uses). `hhmm` runs on past midnight ("00:20" is
 * "24:20") so it sorts after that day's stops; it's for comparing, not for showing.
 */
export function tripClock(now: Date = new Date()): { isoDate: string; hhmm: string } {
  const { isoDate } = tokyoClock(new Date(now.getTime() - 4 * 3_600_000));
  const { hhmm } = tokyoClock(now);
  return { isoDate, hhmm: hhmm < '04:00' ? `${Number(hhmm.slice(0, 2)) + 24}${hhmm.slice(2)}` : hhmm };
}

export function tripDayIndex(days: Day[], now: Date = new Date()): number | 'before' | 'after' {
  const { isoDate } = tripClock(now);
  const i = days.findIndex((d) => d.isoDate === isoDate);
  if (i !== -1) return i;
  return days.length && isoDate < days[0].isoDate ? 'before' : 'after';
}

/**
 * The current and next stop by the clock. With `done` (the ticked stops), a finished current stop
 * hands over to the next one: `now` becomes null, `next` is where to head, and `from` is the stop
 * being left (for the leave-by time and the travel line). Of a "pick one" set, only the picked
 * option (its `choice-d<day>:` check, also in `done`) takes part.
 */
export function nowNext(
  day: Day,
  now: Date = new Date(),
  done?: ReadonlySet<string>,
): { now: Stop | null; next: Stop | null; from: Stop | null } {
  const { hhmm } = tripClock(now);
  // Skipped stops are out of the plan; options count once picked.
  const stops = day.stops.filter((s) => (!s.isOption || done?.has(`choice-d${day.day}:${s.key}`)) && !done?.has(skipKey(s.key)));
  let i = -1;
  stops.forEach((s, idx) => {
    if (s.time <= hhmm) i = idx;
  });
  let j = i;
  while (j >= 0 && done?.has(stops[j].key) && stops[j + 1]) j++;
  if (j === i || done?.has(stops[j].key)) return { now: i >= 0 ? stops[i] : null, next: stops[i + 1] ?? null, from: null };
  return { now: null, next: stops[j], from: stops[j - 1] };
}
