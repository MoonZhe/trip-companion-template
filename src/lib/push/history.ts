import { tokyoClock, tripClock } from '@/lib/time/now';

export interface SentNotification {
  id: string;
  sent_at: string;
  title: string;
  body: string;
  rebuilt: boolean;
}

export interface SentDay {
  isoDate: string;
  items: (SentNotification & { time: string })[];
}

/** Newest day first, newest first within a day. A day turns over at 04:00 Japan time, like the rest of the trip. */
export function groupByTripDay(rows: SentNotification[]): SentDay[] {
  const days = new Map<string, SentDay>();
  const newest = [...rows].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  for (const row of newest) {
    const at = new Date(row.sent_at);
    const { isoDate } = tripClock(at);
    const day = days.get(isoDate) ?? { isoDate, items: [] };
    day.items.push({ ...row, time: tokyoClock(at).hhmm });
    days.set(isoDate, day);
  }
  return [...days.values()];
}
