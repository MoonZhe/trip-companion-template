// Fills an EMPTY Google Sheet with the sample trip in the layout the app reads, so there is
// something to see and a structure to replace with your own plan.
//
//   pnpm tsx --env-file=.env.local scripts/seed-sheet.mts           write the sample
//   pnpm tsx --env-file=.env.local scripts/seed-sheet.mts --check   only build it and parse it, no network
//
// Before running: create a blank sheet, share it with the service account's email as Editor,
// and put its id in SHEET_ID. The script refuses to touch a sheet that already has an Itinerary tab.
import { readFileSync } from 'node:fs';
import { sheetId, sheetsToken } from '../src/lib/sheet/client';
import { formatTime, parseTrip } from '../src/lib/sheet/parse';
import type { RawSheet } from '../src/lib/sheet/types';

const TABS = {
  overview: '🗾 Overview',
  itinerary: '📅 Itinerary',
  budget: '💰 Budget',
  payment: '💳 Payment',
  hotels: '🏨 Hotels',
  log: '📝 Change Log',
} as const;

/** The sample as rows per tab, in today's column layout. Pure, so `--check` can verify it offline. */
export function sampleTabs(raw: RawSheet): Record<keyof typeof TABS, string[][]> {
  const header = raw.itinerary.findIndex((r) => r.includes('Day') && r.includes('Time'));
  const itinerary = raw.itinerary.map((row, i) => {
    const r = [...row];
    if (i === header) {
      r.length = 10;
      return [...r, '✍️ Remarks', '🎟 Book in advance', '🤖 AI notes', "💬 Friend's recs"];
    }
    if (i < header || r.length < 4) return r;
    // Times are stored as day fractions in the fixture; write them back as HH:MM.
    r[2] = formatTime(r[2] ?? '') || (r[2] ?? '');
    // RM cost follows the rate on the Overview tab.
    const n = i + 1;
    if (r[7] && Number.isFinite(Number(r[7]))) r[8] = `=H${n}/JPY_PER_RM`;
    // The fixture's column K was the friend's recs; that is column N now. K is for people's remarks.
    const recs = r[10] ?? '';
    while (r.length < 14) r.push('');
    r[10] = '';
    r[13] = recs;
    return r;
  });

  const hotels = raw.hotels.map((row, i) => {
    const r = [...row];
    if (i === 1) {
      while (r.length < 7) r.push('');
      r[7] = 'Show to staff (name, address, phone in the local language)';
    }
    return r;
  });

  // Payments in rows 3–20, then the two exchange blocks the Money tab reads and writes.
  const payment = raw.payment.map((r) => [...r]);
  while (payment.length < 22) payment.push([]);
  const block = (title: string, colB: string, at: number) => [
    [title],
    ['Who', colB, '¥ received', '¥ per RM', '¥ changed back', 'RM got back', 'History'],
    ['Alex', '', '', `=IF(B${at + 2}>0,C${at + 2}/B${at + 2},"")`, '', '', ''],
    ['Sam', '', '', `=IF(B${at + 3}>0,C${at + 3}/B${at + 3},"")`, '', '', ''],
  ];
  payment.push(...block('💴 Cash exchange', 'RM paid', 23), [], ...block('💳 Wise top-ups', 'RM topped up', 28));

  const log = [
    ['📝 CHANGE LOG'],
    ['#', 'Date', 'Day / Stop', 'Your remark (col K)', 'What changed', 'Before → After'],
  ];
  return { overview: raw.overview, itinerary, budget: raw.budget, payment, hotels, log };
}

const raw = JSON.parse(readFileSync('tests/fixtures/sheet.json', 'utf8')) as RawSheet;
const tabs = sampleTabs(raw);

// Guard: whatever we are about to write must parse into the same trip as the fixture.
const rateRow = tabs.overview.findIndex((r) => /exchange rate/i.test(r[0] ?? ''));
if (rateRow < 0) throw new Error('Sample Overview has no exchange-rate row');
const parsed = parseTrip({ ...raw, itinerary: tabs.itinerary, hotels: tabs.hotels, payment: tabs.payment });
const want = parseTrip(raw);
if (JSON.stringify(parsed.days.map((d) => d.stops.map((s) => s.key))) !== JSON.stringify(want.days.map((d) => d.stops.map((s) => s.key))))
  throw new Error('Sample itinerary no longer parses to the same stops');
console.log(`sample ok: ${parsed.days.length} days, ${parsed.days.reduce((n, d) => n + d.stops.length, 0)} stops, ${parsed.hotels.length} hotels`);
if (process.argv.includes('--check')) process.exit(0);

const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}`;
const token = await sheetsToken(true);
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type Meta = { sheets: { properties: { sheetId: number; title: string } }[] };
const before = await api<Meta>('?fields=sheets.properties(sheetId,title)');
if (before.sheets.some((s) => s.properties.title === TABS.itinerary))
  throw new Error(`This sheet already has a "${TABS.itinerary}" tab. Seed only an empty sheet.`);

await api(':batchUpdate', {
  requests: Object.values(TABS).map((title) => ({ addSheet: { properties: { title, gridProperties: { rowCount: 600, columnCount: 14 } } } })),
});
const meta = await api<Meta>('?fields=sheets.properties(sheetId,title)');
const overviewId = meta.sheets.find((s) => s.properties.title === TABS.overview)!.properties.sheetId;

await api('/values:batchUpdate', {
  valueInputOption: 'USER_ENTERED',
  data: (Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => ({ range: `'${TABS[k]}'!A1`, values: tabs[k] })),
});

// The rate the whole app converts with: a named range on the Overview's exchange-rate cell (column B).
await api(':batchUpdate', {
  requests: [
    {
      addNamedRange: {
        namedRange: {
          name: 'JPY_PER_RM',
          range: { sheetId: overviewId, startRowIndex: rateRow, endRowIndex: rateRow + 1, startColumnIndex: 1, endColumnIndex: 2 },
        },
      },
    },
  ],
});
console.log('Seeded. Open the sheet, delete the empty default tab, then start replacing the sample with your trip.');
