import type { CashExchange, Person } from '@/lib/sheet/types';

/**
 * The Payment tab's two exchange blocks: 💴 cash and 💳 Wise. Each has a header row
 * (Who | RM paid or RM topped up | ¥ received | ¥ per RM | ¥ changed back | RM got back | History)
 * and a Alex and a Sam row of running totals. Column B's header tells the blocks apart.
 */
export type ExchangeKind = 'cash' | 'wise';
const HEADER: Record<ExchangeKind, RegExp> = { cash: /^rm paid/i, wise: /^rm topped up/i };

/** Every amount in a row; 0 when blank. */
export interface ExchangeTotals {
  rm: number;
  jpy: number;
  backJpy: number;
  backRm: number;
}

const cell = (r: string[] | undefined, i: number) => (r?.[i] ?? '').trim();
const amount = (s: string) => {
  const v = Number(s.replace(/[,¥\s]|RM/g, ''));
  return Number.isFinite(v) ? v : 0;
};

/** 0-based index of a person's row in a block, or -1 when the block or the row is missing. */
export function exchangeRow(rows: string[][], kind: ExchangeKind, person: Person): number {
  const header = rows.findIndex((r) => cell(r, 0) === 'Who' && HEADER[kind].test(cell(r, 1)));
  if (header < 0) return -1;
  for (let i = header + 1; i <= header + 3 && i < rows.length; i++) if (cell(rows[i], 0).toLowerCase() === person) return i;
  return -1;
}

export const readTotals = (r: string[] | undefined): ExchangeTotals => ({
  rm: amount(cell(r, 1)),
  jpy: amount(cell(r, 2)),
  backJpy: amount(cell(r, 4)),
  backRm: amount(cell(r, 5)),
});

export const totalsOf = (x: CashExchange | null | undefined): ExchangeTotals => ({
  rm: x?.rm ?? 0,
  jpy: x?.jpy ?? 0,
  backJpy: x?.backJpy ?? 0,
  backRm: x?.backRm ?? 0,
});

export const sameTotals = (a: ExchangeTotals, b: ExchangeTotals) =>
  (['rm', 'jpy', 'backJpy', 'backRm'] as const).every((k) => Math.abs(a[k] - b[k]) < 0.005);

/** Yen per ringgit for the money changed in, or null until both amounts are in. */
export const rateOf = (x: CashExchange | null | undefined) => (x && x.rm > 0 && x.jpy > 0 ? x.jpy / x.rm : null);

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const rmText = (n: number) =>
  `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const jpyText = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

/** One line for the sheet's History column: "17 Oct: +RM 2,000 → ¥76,912" or "3 Nov: ¥5,000 back → RM 120". */
export function historyLine(isoDate: string, change: { rm: number; jpy: number } | { backJpy: number; backRm: number }): string {
  const day = DAY.format(new Date(`${isoDate}T00:00:00Z`));
  return 'backJpy' in change
    ? `${day}: ${jpyText(change.backJpy)} back → ${rmText(change.backRm)}`
    : `${day}: +${rmText(change.rm)} → ${jpyText(change.jpy)}`;
}
