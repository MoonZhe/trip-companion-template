import { skipKey } from '@/lib/trip/skip';
import type { Day } from '@/lib/sheet/types';
import { rateFor, type Expense, type Rates } from './compute';

/** The day's planned spend from the sheet (plain stops, plus whichever option was picked). */
export function plannedJpy(day: Day, checks: Set<string>): number {
  return day.stops
    .filter((s) => (!s.isOption || checks.has(`choice-d${day.day}:${s.key}`)) && !checks.has(skipKey(s.key)))
    .reduce((sum, s) => sum + (s.costJpy ?? 0), 0);
}

/** An expense in yen. Ringgit converts at the rate it was paid at (the payer's own rate for cash). */
export function toJpy(e: Pick<Expense, 'amount' | 'currency' | 'paid_with' | 'paid_by'>, rates: Rates | number): number {
  return e.currency === 'JPY' ? e.amount : e.amount * rateFor(e.paid_with, rates, e.paid_by);
}

/** What we've logged for that date, in yen. */
export function spentJpy(expenses: Expense[], isoDate: string, rates: Rates | number): number {
  return expenses.filter((e) => e.spent_on === isoDate).reduce((sum, e) => sum + toJpy(e, rates), 0);
}

/** The new tax-free system (refund at the airport) starts on 1 Nov 2026. */
export const NEW_TAX_FREE_FROM = '2026-11-01';

/**
 * The trip day a new expense is filed under. Before 4am it's still last night's spending (a late
 * konbini run, the last drink), except a tax-free buy in the small hours of 1 Nov: that was paid
 * under the new rules and has to be claimed at Haneda, so it keeps its real date.
 */
export function defaultSpendDay(clock: { isoDate: string; hhmm: string }, tripDays: string[], taxFree = false): string {
  const yesterday = new Date(Date.parse(`${clock.isoDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const newRulesNight = taxFree && yesterday < NEW_TAX_FREE_FROM && clock.isoDate >= NEW_TAX_FREE_FROM;
  const today = clock.hhmm < '04:00' && !newRulesNight && tripDays.includes(yesterday) ? yesterday : clock.isoDate;
  if (tripDays.includes(today)) return today;
  return today < (tripDays[0] ?? today) ? (tripDays[0] ?? today) : (tripDays.at(-1) ?? today);
}

export function taxFreeHint(isoDate: string): string {
  return isoDate < NEW_TAX_FREE_FROM
    ? 'Tax-free from ¥5,000 per store: show your passport and the 10% comes off at the till.'
    : 'New rules from 1 Nov: pay full price, keep the receipt and the goods unopened, and claim at the Haneda customs kiosk.';
}
