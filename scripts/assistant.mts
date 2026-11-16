// Trip assistant helper, used by the "trip-assistant" scheduled task on Alex's PC.
//   pnpm tsx --env-file=.env.local scripts/assistant.mts context        → JSON: now, today's plan, ticks/skips, recent pushes
//   pnpm tsx --env-file=.env.local scripts/assistant.mts send "Title" "Body" [tag]   → push to every phone, logged with each device's reply
// The log (scripts/.assistant-log.json, gitignored) lets each run see what it already sent.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetchRawSheet } from '../src/lib/sheet/client';
import { parseTrip } from '../src/lib/sheet/parse';
import { tripClock, tokyoClock, tripDayIndex } from '../src/lib/time/now';
import { accepted, deliverAll, recordSent, type DeviceReport } from '../src/lib/push/deliver';

const LOG = 'scripts/.assistant-log.json';
type Sent = { at: string; title: string; body: string; tag: string; devices?: DeviceReport[] };
const readLog = (): Sent[] => (existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : []);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'context') {
  const trip = parseTrip(await fetchRawSheet());
  const idx = tripDayIndex(trip.days);
  const { data: checks } = await supabase.from('checks').select('key');
  const keys = new Set((checks ?? []).map((r) => r.key as string));
  const day = typeof idx === 'number' ? trip.days[idx] : null;
  const next = typeof idx === 'number' ? trip.days[idx + 1] : null;
  const stops = (d: typeof day) =>
    d?.stops.map((s) => ({
      time: s.time,
      title: s.title,
      duration: s.duration,
      travelNext: s.travelNext,
      tips: s.tips,
      bookAhead: s.bookAhead || undefined,
      done: keys.has(s.key) || undefined,
      skipped: keys.has(`skip:${s.key}`) || undefined,
    }));
  // Expenses logged today hint at where they've been, even when no stop got ticked.
  const { data: spent } = await supabase
    .from('expenses')
    .select('created_at, amount, currency, category, note')
    .eq('spent_on', tripClock().isoDate)
    .order('created_at');
  const atJST = (iso: string) => tokyoClock(new Date(iso)).hhmm;
  const since = Date.now() - 36 * 3600_000;
  console.log(
    JSON.stringify(
      {
        nowJST: tokyoClock(),
        tripDay: tripClock(),
        status: typeof idx === 'number' ? 'during' : idx,
        today: day && { day: day.day, label: day.label, date: day.dateLabel, city: day.city, stops: stops(day) },
        tomorrow: next && { day: next.day, label: next.label, date: next.dateLabel, city: next.city, firstStops: stops(next)?.slice(0, 3) },
        expensesToday: (spent ?? []).map((e) => ({ loggedAt: atJST(e.created_at), amount: `${e.amount} ${e.currency}`, category: e.category, note: e.note ?? '' })),
        hotels: trip.hotels.map((h) => ({ city: h.city, name: h.name, nights: h.nightsLabel })),
        sentRecently: readLog().filter((s) => Date.parse(s.at) > since),
      },
      null,
      1,
    ),
  );
} else if (cmd === 'send') {
  const [title, body, tag = `assistant-${Date.now()}`] = args;
  if (!title || !body) throw new Error('usage: send "Title" "Body" [tag]');
  const devices = await deliverAll(supabase, { title, body, tag });
  writeFileSync(LOG, JSON.stringify([...readLog(), { at: new Date().toISOString(), title, body, tag, devices }].slice(-200), null, 1));
  await recordSent(supabase, { title, body, tag }, devices);
  // One line per device: "9Hfg8Q 201 apns-id …" or "9Hfg8Q 400 {"reason":"…"}".
  for (const d of devices) console.log(`${d.device} ${d.status} ${d.apnsId ? `apns-id ${d.apnsId}` : (d.reason ?? '')}${d.removed ? ' (removed)' : ''}`);
  console.log(`sent to ${devices.filter(accepted).length} of ${devices.length} device(s)`);
} else {
  throw new Error('usage: assistant.mts context | send "Title" "Body" [tag]');
}
