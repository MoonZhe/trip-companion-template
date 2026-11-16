import type { BudgetLine, PrePayment } from '@/lib/sheet/types';

export const CATEGORIES = ['food', 'transport', 'activities', 'shopping', 'hotel', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Expense {
  id: string;
  client_id: string;
  spent_on: string;
  amount: number;
  currency: 'JPY' | 'MYR';
  category: Category;
  paid_by: 'alex' | 'sam';
  paid_with: 'wise' | 'cash' | 'card';
  for_whom: 'shared' | 'alex' | 'sam';
  note: string | null;
  /** Bought tax-free (show the passport; from 1 Nov 2026, claimed back at the airport). */
  tax_free?: boolean;
  /** What a card or Wise payment actually cost in ringgit (from the bank app), when we know it. */
  charged_rm?: number | null;
}

/**
 * Yen per ringgit. `base` is the sheet's rate (the estimate for cards); `cash` and `wise` are what each
 * person's cash exchange or Wise top-up actually gave, fees included, once it's set. A plain number
 * means one rate for all.
 */
export interface Rates {
  base: number;
  cash?: Partial<Record<Expense['paid_by'], number | null>>;
  wise?: Partial<Record<Expense['paid_by'], number | null>>;
}
type RateArg = number | Rates;
const asRates = (r: RateArg): Rates => (typeof r === 'number' ? { base: r } : r);

/**
 * The rate a payment converts at. Cash and Wise use the payer's own rate for that kind of money;
 * until they've changed or topped up, the other person's; until then, the sheet rate.
 */
export function rateFor(paidWith: Expense['paid_with'] | undefined, rates: RateArg, paidBy?: Expense['paid_by']): number {
  const r = asRates(rates);
  const own = paidWith === 'cash' ? r.cash : paidWith === 'wise' ? r.wise : undefined;
  if (!own) return r.base;
  const other = paidBy === 'sam' ? 'alex' : 'sam';
  return (paidBy && own[paidBy]) || own[other] || r.base;
}

/** A card payment whose ringgit is still the estimate, not what the bank charged. */
export const isEstimate = (e: Pick<Expense, 'currency' | 'paid_with' | 'charged_rm'>) =>
  e.currency === 'JPY' && e.paid_with === 'card' && e.charged_rm == null;

const SECTION_FOR: Record<Category, string> = {
  food: 'FOOD',
  transport: 'TRANSPORT',
  activities: 'ACTIVITIES',
  shopping: 'MISC',
  other: 'MISC',
  hotel: 'ACCOMMODATION',
};
const PRE_SECTION_FOR: Record<string, string> = { flight: 'FLIGHTS', hotel: 'ACCOMMODATION', train: 'TRANSPORT' };

const isFloat = (p: PrePayment) => p.type.toLowerCase() === 'cash';

/** In ringgit: what was actually charged if we know it, else converted at the payment method's rate. */
export function toRm(
  e: Pick<Expense, 'amount' | 'currency'> & Partial<Pick<Expense, 'paid_with' | 'paid_by' | 'charged_rm'>>,
  rates: RateArg,
): number {
  if (e.currency !== 'JPY') return e.amount;
  if (e.charged_rm != null) return Number(e.charged_rm);
  return e.amount / rateFor(e.paid_with, rates, e.paid_by);
}

export function totals(exps: Expense[], pre: PrePayment[], rates: RateArg) {
  const byDay: Record<string, number> = {};
  let tripRm = 0;
  for (const e of exps) {
    const rm = toRm(e, rates);
    tripRm += rm;
    byDay[e.spent_on] = (byDay[e.spent_on] ?? 0) + rm;
  }
  const preRm = pre.filter((p) => !isFloat(p)).reduce((s, p) => s + p.amountRm, 0);
  return { tripRm, preRm, allRm: tripRm + preRm, byDay };
}

export function budgetCompare(exps: Expense[], pre: PrePayment[], budget: BudgetLine[], rates: RateArg) {
  const budgetBy = new Map<string, number>();
  for (const b of budget) budgetBy.set(b.section, (budgetBy.get(b.section) ?? 0) + b.rm);

  const actualBy = new Map<string, number>();
  const add = (section: string, rm: number) => actualBy.set(section, (actualBy.get(section) ?? 0) + rm);
  for (const e of exps) add(SECTION_FOR[e.category], toRm(e, rates));
  for (const p of pre) {
    const section = PRE_SECTION_FOR[p.type.toLowerCase()];
    if (section) add(section, p.amountRm);
  }

  return [...budgetBy].map(([section, budgetRm]) => ({ section, budgetRm, actualRm: actualBy.get(section) ?? 0 }));
}

/**
 * What the trip cost each of us: everything just for that person (their own shopping)
 * plus half of everything shared (flights, hotels, meals). Excludes the Wise top-up.
 */
export function perPerson(exps: Expense[], pre: PrePayment[], rates: RateArg) {
  const out = { alex: { spent: 0, own: 0, sharedHalf: 0 }, sam: { spent: 0, own: 0, sharedHalf: 0 } };
  const add = (forWhom: Expense['for_whom'], rm: number) => {
    if (forWhom === 'shared') {
      out.alex.sharedHalf += rm / 2;
      out.sam.sharedHalf += rm / 2;
    } else out[forWhom].own += rm;
  };
  for (const e of exps) add(e.for_whom, toRm(e, rates));
  for (const p of pre.filter((x) => !isFloat(x))) add('shared', p.amountRm);
  for (const who of ['alex', 'sam'] as const) out[who].spent = out[who].own + out[who].sharedHalf;
  return out;
}

/**
 * The amount typed in the expense sheet, which may be a sum ("50 + 50 + 50" → 150, "200 - 50" → 150).
 * Thousands commas are ignored and a trailing "+" or "-" (still typing) doesn't count. NaN when a
 * part isn't a number.
 */
export function sumAmount(text: string): number {
  const parts = text
    .replace(/[,\s]/g, '')
    .replace(/[+-]$/, '')
    .split(/(?=[+-])/);
  let total = 0;
  for (const part of parts) {
    const num = part.replace(/^[+-]/, '');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(num)) return NaN;
    total += part.startsWith('-') ? -Number(num) : Number(num);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Who owes whom. Each payment is split by who it was for: shared ones half each, personal ones all
 * to that person. Whatever the payer covered beyond their own share is owed back to them.
 * `from` owes `to` `rm` ringgit; null when we're square (under RM 0.50). Pass `pre` to count the
 * bookings made before the trip too (the Wise/cash float is left out, as in `perPerson`).
 */
export function settleUp(
  exps: Expense[],
  rates: RateArg,
  pre: PrePayment[] = [],
): { from: Expense['paid_by']; to: Expense['paid_by']; rm: number } | null {
  // Positive: Sam owes Alex.
  let alexAhead = 0;
  const add = (paidBy: Expense['paid_by'], forWhom: Expense['for_whom'], rm: number) => {
    const theirs = forWhom === 'shared' ? rm / 2 : forWhom === paidBy ? 0 : rm;
    alexAhead += paidBy === 'alex' ? theirs : -theirs;
  };
  for (const e of exps) add(e.paid_by, e.for_whom, toRm(e, rates));
  for (const p of pre.filter((x) => !isFloat(x))) add(p.payer, 'shared', p.amountRm);
  const rm = Math.round(Math.abs(alexAhead) * 100) / 100;
  if (rm < 0.5) return null;
  return alexAhead > 0 ? { from: 'sam', to: 'alex', rm } : { from: 'alex', to: 'sam', rm };
}
