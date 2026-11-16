import 'server-only';
import { ITINERARY_TAB, sheetId, sheetsToken } from './client';
import { DAY_HEADER, ITINERARY_ROWS } from './parse';
import { addStopRequests, alreadyAdded, findAddedRow, insertRowFor, removeStopRequests, type NewStop } from './insert';
import type { Person } from './types';
import { exchangeRow, readTotals, sameTotals, type ExchangeKind, type ExchangeTotals } from '@/lib/money/exchange';

export type { NewStop };

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

async function call(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}/${sheetId()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const PAYMENT_TAB = '💳 Payment';

/** The row in the sheet no longer has the totals the phone started from (the other phone, or a retry). */
export class ExchangeConflict extends Error {}

/**
 * Sets one person's totals in a Payment tab exchange block (the ¥-per-RM formula in D stays) and adds
 * `line` to its History. Only writes if the row still holds `expected`, so a retried "add" can't count
 * twice. `next` null clears the row, history included.
 */
export async function setExchangeInSheet(
  kind: ExchangeKind,
  person: Person,
  expected: ExchangeTotals | null,
  next: ExchangeTotals | null,
  line: string | null,
): Promise<void> {
  const token = await sheetsToken(true);
  const range = encodeURIComponent(`'${PAYMENT_TAB}'!A1:G60`);
  const { values = [] } = (await call(token, `/values/${range}?valueRenderOption=UNFORMATTED_VALUE`)) as {
    values?: unknown[][];
  };
  const rows = values.map((r) => r.map((c) => (c == null ? '' : String(c))));
  const i = exchangeRow(rows, kind, person);
  if (i < 0) throw new Error(`No ${person} row in the ${kind} block of the Payment tab`);
  if (expected && !sameTotals(readTotals(rows[i]), expected)) throw new ExchangeConflict();

  const n = i + 1; // 1-based sheet row
  const blank = (v: number | undefined) => (v ? v : '');
  const history = next ? [rows[i][6] ?? '', line ?? ''].filter((s) => s.trim()).join('\n') : '';
  await call(token, '/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `'${PAYMENT_TAB}'!B${n}:C${n}`, values: [[blank(next?.rm), blank(next?.jpy)]] },
        { range: `'${PAYMENT_TAB}'!E${n}:G${n}`, values: [[blank(next?.backJpy), blank(next?.backRm), history]] },
      ],
    }),
  });
}

/** Inserts a stop into its day in the Itinerary tab, in time order, keeping the row styling. */
export async function addStopToSheet(stop: NewStop): Promise<void> {
  const token = await sheetsToken(true);
  const range = encodeURIComponent(`'${ITINERARY_TAB}'!A1:K${ITINERARY_ROWS}`);
  const [{ values = [] }, meta] = await Promise.all([
    call(token, `/values/${range}?valueRenderOption=UNFORMATTED_VALUE`) as Promise<{ values?: unknown[][] }>,
    call(token, '?fields=sheets.properties(sheetId,title)') as Promise<{
      sheets: { properties: { sheetId: number; title: string } }[];
    }>,
  ]);
  const rows = values.map((r) => r.map((c) => (c == null ? '' : String(c))));
  const tab = meta.sheets.find((s) => s.properties.title === ITINERARY_TAB);
  if (!tab) throw new Error('Itinerary tab not found');

  // Already there (a retry after the first response was lost): nothing to add.
  if (alreadyAdded(rows, stop)) return;
  const index = insertRowFor(rows, stop.day, stop.time);
  const dayHeader = rows.find((r) => (r[0] ?? '').match(DAY_HEADER)?.[1] === String(stop.day))?.[0] ?? '';
  const dateLabel = dayHeader.match(DAY_HEADER)?.[2]?.trim() ?? '';
  const afterHeader = DAY_HEADER.test((rows[index - 1]?.[0] ?? '').trim());

  await call(token, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: addStopRequests(stop, {
        sheetId: tab.properties.sheetId,
        index,
        dateLabel,
        afterHeader,
        prevTravel: rows[index - 1]?.[6] ?? '',
      }),
    }),
  });
}

/**
 * Removes a stop that was added from the app (planned stops can't be found this way, so they're
 * safe). Already gone counts as done, so a retry is harmless.
 */
export async function removeStopFromSheet(stop: Pick<NewStop, 'day' | 'time' | 'title'>): Promise<void> {
  const token = await sheetsToken(true);
  const range = encodeURIComponent(`'${ITINERARY_TAB}'!A1:K${ITINERARY_ROWS}`);
  const [{ values = [] }, meta] = await Promise.all([
    call(token, `/values/${range}?valueRenderOption=UNFORMATTED_VALUE`) as Promise<{ values?: unknown[][] }>,
    call(token, '?fields=sheets.properties(sheetId,title)') as Promise<{
      sheets: { properties: { sheetId: number; title: string } }[];
    }>,
  ]);
  const rows = values.map((r) => r.map((c) => (c == null ? '' : String(c))));
  const tab = meta.sheets.find((s) => s.properties.title === ITINERARY_TAB);
  if (!tab) throw new Error('Itinerary tab not found');
  const index = findAddedRow(rows, stop);
  if (index < 0) return;
  await call(token, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: removeStopRequests(rows, index, tab.properties.sheetId) }),
  });
}
