import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Day, Trip } from '@/lib/sheet/types';
import { cityOf, hotelFor } from '@/lib/trip/city';
import { loadTrip } from '@/lib/sheet/load';
import { tokyoClock } from '@/lib/time/now';
import { buildBrief, buildEvening, type Brief, type BriefExtras } from './brief';
import { forecastFor } from './forecast';
import { accepted, deliverAll, type DeviceReport } from './deliver';

export type BriefKind = 'morning' | 'evening';

const CHECKOUT = /check-?out/i;

/** Checking out that day: last night's hotel isn't tonight's (or we fly home). */
function movingDay(trip: Trip, index: number): BriefExtras['moving'] {
  if (index === 0) return null;
  const last = hotelFor(trip.days, index - 1, trip.hotels);
  const tonight = hotelFor(trip.days, index, trip.hotels);
  if (!last || last.name === tonight?.name) return null;
  const stop = trip.days[index].stops.find((s) => CHECKOUT.test(`${s.title} ${s.tips}`));
  return { at: stop?.time || null };
}

/** The day's stops that have a ticket saved in the app, in order. */
async function ticketed(supabase: SupabaseClient, day: Day): Promise<NonNullable<BriefExtras['tickets']>> {
  const keys = day.stops.map((s) => s.key);
  if (!keys.length) return [];
  const { data } = await supabase.from('files').select('stop_key').eq('kind', 'ticket').in('stop_key', keys);
  const have = new Set((data ?? []).map((r) => r.stop_key as string));
  return day.stops
    .filter((s) => have.has(s.key))
    .map((s) => ({ time: s.time, title: s.title.replace(/^\[Option [A-Z]\]\s*/, '') }));
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The morning brief (today) or evening preview (tomorrow), or null when that isn't a trip day.
 * `anyDay` falls back to Day 1 so it can be tried before the trip.
 */
export async function composeBrief(
  supabase: SupabaseClient,
  { kind = 'morning', anyDay = false }: { kind?: BriefKind; anyDay?: boolean } = {},
): Promise<Brief | null> {
  const trip = await loadTrip(supabase);
  const target = addDays(tokyoClock().isoDate, kind === 'evening' ? 1 : 0);
  let index = trip.days.findIndex((d) => d.isoDate === target);
  if (index === -1 && anyDay) index = 0;
  if (index === -1) return null;
  return composeForDay(supabase, trip, index, kind);
}

/** The brief for one day of the trip: `kind` picks the morning or the evening-before wording. */
export async function composeForDay(supabase: SupabaseClient, trip: Trip, index: number, kind: BriefKind): Promise<Brief> {
  const day = trip.days[index];
  const weather = await forecastFor(cityOf(day.city).key, day.isoDate);
  const moving = movingDay(trip, index);
  return kind === 'evening'
    ? buildEvening(day, weather, { moving })
    : buildBrief(day, weather, { moving, tickets: await ticketed(supabase, day) });
}

/**
 * Push a brief to every subscription the client can see (the admin client sees all phones; a
 * signed-in client sees only its own, through RLS). Phones that unsubscribed are cleaned up.
 * Each device's answer is logged, so a missed notification can be traced in the Vercel logs.
 */
export async function pushBrief(
  supabase: SupabaseClient,
  brief: Brief,
): Promise<{ sent: number; removed: number; devices: DeviceReport[] }> {
  const devices = await deliverAll(supabase, { title: brief.title, body: brief.body, tag: brief.tag });
  console.log('[push]', JSON.stringify({ tag: brief.tag, devices }));
  return { sent: devices.filter(accepted).length, removed: devices.filter((d) => d.removed).length, devices };
}
