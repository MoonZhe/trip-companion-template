import { cityOf } from '@/lib/trip/city';
import type { Day } from '@/lib/sheet/types';

export interface BriefWeather {
  code: number;
  max: number;
  min: number;
  rain: number;
  /** First hour (08–22) with a 50%+ chance of rain, e.g. 15; null when it stays mostly dry. */
  rainFrom: number | null;
  /** Temperature at 9am. */
  morning: number | null;
}

export interface BriefExtras {
  /** Checking out today: the time it's planned, or null when the sheet doesn't say. */
  moving?: { at: string | null } | null;
  /** Today's stops with a ticket saved in the app. */
  tickets?: { time: string; title: string }[];
}

export interface Brief {
  title: string;
  body: string;
  tag: string;
}

const MAX_BODY = 240;
const COLD = 12;

/** Short weather icon from a WMO code (same grouping the app uses). */
function weatherEmoji(code: number): string {
  if (code === 0 || code === 1) return '☀';
  if (code === 2) return '⛅';
  if (code === 3) return '☁';
  if (code === 45 || code === 48) return '🌫';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄';
  if (code >= 95) return '⛈';
  return '🌧';
}

/** 15 → "3pm", 9 → "9am", 12 → "noon". */
export function hourLabel(h: number): string {
  if (h === 12) return 'noon';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function weatherLines(w: BriefWeather | null): string[] {
  if (!w) return [];
  const rain =
    w.rainFrom === null
      ? ` · rain ${w.rain}%`
      : w.rainFrom <= 8
        ? ' · rain likely all day, take an umbrella'
        : ` · rain from ${hourLabel(w.rainFrom)}, take an umbrella`;
  const lines = [`${weatherEmoji(w.code)} ${w.max}° / ${w.min}°${rain}`];
  if (w.morning !== null && w.morning <= COLD) lines.push(`🧥 Cold morning (${w.morning}°), bring a layer`);
  return lines;
}

function dayLines(day: Day, extras: BriefExtras): string[] {
  const lines: string[] = [];
  if (extras.moving) lines.push(`🧳 Moving day: checkout${extras.moving.at ? ` ${extras.moving.at}` : ''}, bring the luggage`);
  // The sheet lists stops in order ("9:30" would sort after "10:00" as text).
  const first = day.stops.find((s) => !s.isOption);
  if (first) lines.push(`First up: ${first.time} ${clip(first.title, 60)}`);
  const t = extras.tickets ?? [];
  if (t.length) lines.push(`🎟 Tickets saved: ${t.map((x) => `${clip(x.title, 28)} ${x.time}`).join(', ')}`);
  return lines;
}

/** Morning notification: the day's weather, moving-day reminder, first stop and today's tickets. */
export function buildBrief(day: Day, weather: BriefWeather | null, extras: BriefExtras = {}): Brief {
  const body = [...weatherLines(weather), ...dayLines(day, extras)].join('\n');
  return { title: `Day ${day.day} · ${cityOf(day.city).name}`, body: body.slice(0, MAX_BODY), tag: 'morning-brief' };
}

/** 9pm notification: tomorrow's weather, moving-day reminder and first stop (to set an alarm by). */
export function buildEvening(day: Day, weather: BriefWeather | null, extras: BriefExtras = {}): Brief {
  const body = [...weatherLines(weather), ...dayLines(day, { moving: extras.moving })].join('\n');
  return {
    title: `Tomorrow · Day ${day.day} · ${cityOf(day.city).name}`,
    body: body.slice(0, MAX_BODY),
    tag: 'evening-preview',
  };
}
