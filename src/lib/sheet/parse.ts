import { TRIP } from '@/trip.config';
import {
  SheetFormatError,
  type BudgetLine,
  type CashExchange,
  type Day,
  type Flight,
  type Hotel,
  type Person,
  type PrePayment,
  type RawSheet,
  type Trip,
} from './types';
import { exchangeRow, readTotals, type ExchangeKind } from '@/lib/money/exchange';

const TRIP_YEAR = TRIP.year;
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const COLUMN_ALIASES = {
  day: ['Day'],
  date: ['Date'],
  time: ['Time'],
  title: ['Activity / Location', 'Activity', 'Location'],
  tips: ['Highlights & Tips', 'Highlights', 'Tips'],
  duration: ['Duration'],
  travelNext: ['Travel to Next Stop', 'Travel'],
  cost: ['Cost ¥ (2 pax)', 'Cost ¥', 'Cost JPY'],
  category: ['Category'],
  bookAhead: ['Book in advance', 'Book ahead'],
} as const;
type Column = keyof typeof COLUMN_ALIASES;
/** Headers that carry emoji or a trailing explanation, so they're matched by substring. */
const FUZZY: Column[] = ['bookAhead'];
const REQUIRED: Column[] = ['day', 'time', 'title'];

/** Itinerary rows read from the sheet, both for showing the plan and for finding where to add a stop. */
export const ITINERARY_ROWS = 500;

export const DAY_HEADER = /DAY\s*(\d+)\s*·\s*([^·]+?)\s*·\s*(.+)$/i;

const cell = (row: string[] | undefined, i: number | undefined) => (i === undefined ? '' : (row?.[i] ?? '').trim());

const num = (v: string): number | null => {
  const n = Number(v.replace(/[¥,\sRM]/g, ''));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** Sheet times arrive as day fractions (0.4583 = 11:00) or as "HH:MM" text. */
export function formatTime(v: string): string {
  const s = v.trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;
  const f = Number(s);
  if (s === '' || !Number.isFinite(f)) return '';
  const mins = Math.round((f % 1) * 24 * 60);
  return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export function stopKey(day: number, time: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `d${day}-${time.replace(':', '')}-${slug}`;
}

function isoFromLabel(label: string): string {
  const m = label.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!m) return '';
  const month = MONTHS[m[2].toLowerCase()];
  return month ? `${TRIP_YEAR}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

export function findColumns(rows: string[][]): { headerRow: number; cols: Partial<Record<Column, number>> } {
  const headerRow = rows.findIndex((r) => r.some((c) => c.trim() === 'Day') && r.some((c) => c.trim() === 'Time'));
  if (headerRow === -1) throw new SheetFormatError('Itinerary header row (Day/Time) not found');
  const header = rows[headerRow].map((c) => c.trim().toLowerCase());
  const cols: Partial<Record<Column, number>> = {};
  for (const [col, aliases] of Object.entries(COLUMN_ALIASES) as [Column, readonly string[]][]) {
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      const i = FUZZY.includes(col) ? header.findIndex((h) => h.includes(a)) : header.indexOf(a);
      if (i !== -1) {
        cols[col] = i;
        break;
      }
    }
  }
  const missing = REQUIRED.filter((c) => cols[c] === undefined);
  if (missing.length) throw new SheetFormatError(`Itinerary column(s) missing: ${missing.join(', ')}`);
  return { headerRow, cols };
}

function parseDays(rows: string[][], warnings: string[]): Day[] {
  const { headerRow, cols } = findColumns(rows);
  const days: Day[] = [];
  const seen = new Set<string>();

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const first = cell(row, 0);
    const header = first.match(DAY_HEADER);
    if (header) {
      const dateLabel = header[2].trim();
      days.push({
        day: Number(header[1]),
        label: first.replace(/\s+/g, ' ').trim(),
        dateLabel,
        isoDate: isoFromLabel(dateLabel),
        city: header[3].trim(),
        stops: [],
      });
      continue;
    }

    const time = formatTime(cell(row, cols.time));
    const title = cell(row, cols.title);
    if (!time || !title) continue; // banners, legends and blank rows

    const dayNum = Number(cell(row, cols.day));
    const day = days.find((d) => d.day === dayNum);
    if (!Number.isInteger(dayNum) || !day) {
      warnings.push(`Skipped row ${r + 1}: unrecognised day "${cell(row, cols.day)}"`);
      continue;
    }

    let key = stopKey(dayNum, time, title);
    for (let n = 2; seen.has(key); n++) key = `${stopKey(dayNum, time, title)}-${n}`;
    seen.add(key);

    day.stops.push({
      key,
      day: dayNum,
      date: cell(row, cols.date) || day.dateLabel,
      time,
      title,
      tips: cell(row, cols.tips),
      duration: cell(row, cols.duration),
      travelNext: cell(row, cols.travelNext),
      costJpy: num(cell(row, cols.cost)),
      category: cell(row, cols.category),
      isOption: /^\[option/i.test(title),
      bookAhead: cell(row, cols.bookAhead),
    });
  }
  return days;
}

function parseFlights(rows: string[][]): Flight[] {
  const flights: Flight[] = [];
  rows.forEach((row, i) => {
    const head = cell(row, 0).toUpperCase();
    if (head !== 'OUTBOUND' && head !== 'RETURN') return;
    const f: Flight = {
      direction: head === 'OUTBOUND' ? 'outbound' : 'return',
      route: cell(row, 1),
      details: cell(row, 2),
      airline: '',
      departure: '',
      arrival: '',
      luggage: '',
    };
    for (let j = i + 1; j < rows.length && cell(rows[j], 0); j++) {
      const label = cell(rows[j], 0).toLowerCase();
      if (label === 'airline') f.airline = cell(rows[j], 1);
      if (label === 'departure') {
        f.departure = cell(rows[j], 1);
        f.luggage = cell(rows[j], 2);
      }
      if (label === 'arrival') f.arrival = cell(rows[j], 1);
    }
    flights.push(f);
  });
  return flights;
}

function parseHotels(rows: string[][]): Hotel[] {
  return rows
    .filter((r) => /BOOKED|nights/i.test(cell(r, 0)) && cell(r, 1))
    .map((r) => {
      const lines = cell(r, 0)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const cityIdx = lines.findIndex((l) => /^[A-Z]{3,}$/.test(l));
      return {
        city: cityIdx >= 0 ? lines[cityIdx] : '',
        name: cell(r, 1),
        area: cell(r, 2).replace(/\n/g, ' '),
        nightsLabel: lines.slice(cityIdx + 1).join(' · '),
        notes: cell(r, 5),
        ja: cell(r, 7),
      };
    });
}

function parseBudget(rows: string[][]): BudgetLine[] {
  return rows
    .map((r) => ({ section: cell(r, 0).toUpperCase(), item: cell(r, 1), jpy: num(cell(r, 2)), rm: num(cell(r, 3)) }))
    .filter((b): b is BudgetLine => !!b.section && !!b.item && b.rm !== null && b.section !== 'CATEGORY');
}

function parsePayments(rows: string[][]): PrePayment[] {
  const out: PrePayment[] = [];
  for (const r of rows) {
    const type = cell(r, 0);
    const amount = num(cell(r, 2));
    const payer = cell(r, 3).toLowerCase();
    if (!type || type === 'Type' || amount === null) continue;
    if (payer !== 'alex' && payer !== 'sam') continue;
    out.push({ type, desc: cell(r, 1), amountRm: amount, payer: payer as Person });
  }
  return out;
}

/**
 * One of the Payment tab's exchange blocks (💴 cash or 💳 Wise, see `exchangeRow`): each person's
 * totals, null until they've entered any. (Its rows have no payer in column D, so parsePayments skips them.)
 */
export function parseExchange(rows: string[][], kind: ExchangeKind = 'cash'): Record<Person, CashExchange | null> {
  const out: Record<Person, CashExchange | null> = { alex: null, sam: null };
  for (const who of ['alex', 'sam'] as const) {
    const i = exchangeRow(rows, kind, who);
    if (i < 0) continue;
    const t = readTotals(rows[i]);
    if (!(t.rm > 0 || t.jpy > 0 || t.backJpy > 0 || t.backRm > 0)) continue;
    const history = cell(rows[i], 6);
    out[who] = {
      rm: t.rm,
      jpy: t.jpy,
      ...(t.backJpy > 0 && { backJpy: t.backJpy }),
      ...(t.backRm > 0 && { backRm: t.backRm }),
      ...(history && { history }),
    };
  }
  return out;
}

const stopCount = (trip: Pick<Trip, 'days'>) => trip.days.reduce((n, d) => n + d.stops.length, 0);

/**
 * Whether a freshly read trip may replace the saved snapshot. A plan that suddenly lost over half
 * its stops is more likely a sheet mishap than a real edit, so the good copy is kept.
 */
export function replacesSnapshot(next: Pick<Trip, 'days'>, saved: Pick<Trip, 'days'> | null | undefined): boolean {
  if (!saved?.days) return true;
  return stopCount(next) * 2 >= stopCount(saved);
}

export function parseTrip(raw: RawSheet, now: Date = new Date()): Trip {
  const warnings: string[] = [];
  const jpyPerRm = num(raw.jpyPerRm);
  if (jpyPerRm === null || jpyPerRm <= 0) throw new SheetFormatError('Exchange rate (JPY_PER_RM) is missing');
  // A mistyped day header would otherwise give an empty or dateless plan that looks fine and gets
  // saved over the good snapshot. Throwing makes loadTrip serve that snapshot instead.
  const days = parseDays(raw.itinerary, warnings);
  if (!days.length) throw new SheetFormatError('No "DAY n · date · city" headers found in the itinerary');
  const undated = days.find((d) => !d.isoDate);
  if (undated) throw new SheetFormatError(`Day ${undated.day} header has no date like "24 Oct"`);
  if (raw.itinerary.length >= ITINERARY_ROWS)
    warnings.push(`The itinerary is longer than the ${ITINERARY_ROWS} rows the app reads; later stops are missing`);
  return {
    days,
    hotels: parseHotels(raw.hotels),
    flights: parseFlights(raw.overview),
    budget: parseBudget(raw.budget),
    prePayments: parsePayments(raw.payment),
    cashExchange: parseExchange(raw.payment, 'cash'),
    wise: parseExchange(raw.payment, 'wise'),
    jpyPerRm,
    fetchedAt: now.toISOString(),
    warnings,
  };
}
