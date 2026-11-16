import { JWT } from 'google-auth-library';
import { ITINERARY_ROWS } from './parse';
import type { RawSheet } from './types';

export const ITINERARY_TAB = '📅 Itinerary';

const RANGES = {
  itinerary: `'📅 Itinerary'!A1:N${ITINERARY_ROWS}`,
  hotels: "'🏨 Hotels'!A1:H10",
  overview: "'🗾 Overview'!A1:C40",
  budget: "'💰 Budget'!A1:D50",
  payment: "'💳 Payment'!A1:G40",
  jpyPerRm: 'JPY_PER_RM',
} as const;

function credentials(): { client_email: string; private_key: string } {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function toStrings(values: unknown[][] | undefined): string[][] {
  return (values ?? []).map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v))));
}

export function sheetId(): string {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('SHEET_ID is not set');
  return id;
}

export async function sheetsToken(write = false): Promise<string> {
  const { client_email, private_key } = credentials();
  const jwt = new JWT({
    email: client_email,
    key: private_key,
    scopes: [`https://www.googleapis.com/auth/spreadsheets${write ? '' : '.readonly'}`],
  });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error('Could not get a Google access token');
  return token;
}

export async function fetchRawSheet(): Promise<RawSheet> {
  const token = await sheetsToken();

  const keys = Object.keys(RANGES) as (keyof typeof RANGES)[];
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
  for (const k of keys) params.append('ranges', RANGES[k]);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values:batchGet?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    // A stalled Sheets call falls back to the saved snapshot instead of hanging the page or the brief.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { valueRanges: { values?: unknown[][] }[] };

  const out = {} as Record<keyof typeof RANGES, string[][]>;
  keys.forEach((k, i) => (out[k] = toStrings(body.valueRanges[i]?.values)));
  return { ...out, jpyPerRm: out.jpyPerRm[0]?.[0] ?? '' };
}
