import type { Day, Stop } from '@/lib/sheet/types';
import { parseTips } from './tips';

// Ends on "not a letter" rather than , so the hour in "1h30min" counts too.
const DURATION = /(\d+(?:\.\d+)?)\+?\s*(?:[–-]\s*(\d+(?:\.\d+)?))?\s*(h(?:rs?|ours?)?|min(?:s|utes)?)(?![a-z])/gi;

/**
 * Minutes in a sheet travel or duration cell: "~25 min", "1.75 hr", "2h 15min", "15–20 min" (the
 * slower end), "Walk 2 min + JR 25 min" (added up). Alternatives after "or" and asides in
 * brackets are ignored. Null when there's no number to go on ("Walk", "—").
 */
export function parseMinutes(text: string): number | null {
  const main = text.replace(/\(.*?\)/g, '').split(/\s+or\s+/i)[0];
  let total = 0;
  let found = false;
  for (const m of main.matchAll(DURATION)) {
    const n = Number(m[2] ?? m[1]);
    total += /^h/i.test(m[3]) ? n * 60 : n;
    found = true;
  }
  return found ? Math.round(total) : null;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMinutes = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export interface LeaveBy {
  /** "13:35": when to set off from the current stop to reach the next one on time. */
  at: string;
  travelMin: number;
  /** Minutes from now until `at`; negative when we're already late. */
  inMin: number;
}

/** When to leave `from` to arrive at `to` on time, using the travel time written on `from`. */
export function leaveBy(from: Stop, to: Stop, nowHhmm: string): LeaveBy | null {
  const travelMin = parseMinutes(from.travelNext);
  if (travelMin === null || !to.time) return null;
  const at = toMinutes(to.time) - travelMin;
  return { at: fromMinutes(at), travelMin, inMin: at - toMinutes(nowHhmm) };
}

export type LeaveTone = 'relaxed' | 'soon' | 'now' | 'late';

export function leaveTone(inMin: number): LeaveTone {
  if (inMin < -2) return 'late';
  if (inMin <= 5) return 'now';
  if (inMin <= 20) return 'soon';
  return 'relaxed';
}

export function leaveLabel(l: LeaveBy): string {
  const tone = leaveTone(l.inMin);
  if (tone === 'late') return `${-l.inMin} min behind. Leave now`;
  if (tone === 'now') return 'Time to go';
  const h = Math.floor(l.inMin / 60);
  const m = l.inMin % 60;
  return `Leave in ${h ? `${h} hr ${m ? `${m} min` : ''}`.trim() : `${m} min`}`;
}

export interface DayEnd {
  /** The last planned stop of the day (options excluded). */
  last: Stop;
  /** When the last stop should wrap up ("22:45"), if its duration is known. */
  endsAt: string | null;
  /** How to get back, from the last stop's travel cell. Empty when the sheet has "—". */
  travel: string;
  /** A "Last train …" line from the last stop's tips, if the sheet has one. */
  lastTrain: string | null;
  /** The day finishes late enough that the last train is worth a thought. */
  late: boolean;
}

export function dayEnd(day: Day): DayEnd | null {
  const stops = day.stops.filter((s) => !s.isOption);
  const last = stops.at(-1);
  if (!last) return null;
  const dur = parseMinutes(last.duration);
  const endMin = dur === null ? null : toMinutes(last.time) + dur;
  const lastTrain = parseTips(last.tips).points.find((p) => /^last train/i.test(p.text))?.text ?? null;
  return {
    last,
    endsAt: endMin === null ? null : fromMinutes(endMin),
    travel: last.travelNext && last.travelNext !== '—' ? last.travelNext : '',
    lastTrain,
    late: lastTrain !== null || (endMin !== null && endMin >= 22 * 60),
  };
}

/**
 * Where a stop's travel cell leads: the next planned stop, or 'hotel' after the day's last one.
 * Null when the way on is a "pick one" choice (the picker gives each option its own directions).
 */
export function nextStopOf(day: Day, stop: Stop): Stop | 'hotel' | null {
  const i = day.stops.findIndex((s) => s.key === stop.key);
  if (i < 0) return null;
  let rest = day.stops.slice(i + 1);
  // An option leads to whatever follows the whole set of options.
  if (stop.isOption) rest = rest.filter((s) => !s.isOption);
  const next = rest[0];
  if (!next) return 'hotel';
  return next.isOption ? null : next;
}
