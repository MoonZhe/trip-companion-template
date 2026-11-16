import { describe, expect, it } from 'vitest';
import type { Day, Stop } from '@/lib/sheet/types';
import type { Expense } from '@/lib/money/compute';
import { defaultSpendDay, plannedJpy, spentJpy, taxFreeHint, toJpy } from '@/lib/money/today';

const s = (key: string, costJpy: number | null, isOption = false) => ({ key, costJpy, isOption }) as Stop;
const day = { day: 10, stops: [s('a', 3000), s('b', null), s('c', 2400, true), s('d', 500, true)] } as Day;
const e = (
  spent_on: string,
  amount: number,
  currency: 'JPY' | 'MYR',
  paid_with: Expense['paid_with'] = 'card',
  paid_by: Expense['paid_by'] = 'alex',
) => ({ spent_on, amount, currency, paid_with, paid_by }) as Expense;
const tripDays = ['2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01', '2026-11-02'];

describe('today money', () => {
  it('plans plain stops plus the picked option', () => {
    expect(plannedJpy(day, new Set())).toBe(3000);
    expect(plannedJpy(day, new Set(['choice-d10:c']))).toBe(5400);
  });
  it('leaves skipped stops out of the plan', () => {
    expect(plannedJpy(day, new Set(['skip:a']))).toBe(0);
  });
  it('adds up the day in yen', () => {
    expect(
      spentJpy([e('2026-11-02', 1000, 'JPY'), e('2026-11-02', 10, 'MYR'), e('2026-11-01', 99, 'JPY')], '2026-11-02', 38),
    ).toBe(1380);
  });
  it("converts ringgit cash at the payer's own rate", () => {
    const rates = { base: 38, cash: { alex: 40, sam: 39 } };
    expect(toJpy(e('2026-11-02', 100, 'MYR', 'cash', 'alex'), rates)).toBe(4000);
    expect(toJpy(e('2026-11-02', 100, 'MYR', 'card', 'alex'), rates)).toBe(3800);
    expect(toJpy(e('2026-11-02', 500, 'JPY', 'cash', 'sam'), rates)).toBe(500);
    expect(spentJpy([e('2026-11-02', 100, 'MYR', 'cash', 'sam'), e('2026-11-02', 100, 'JPY')], '2026-11-02', rates)).toBe(4000);
  });
  it('switches tax-free advice on 1 Nov', () => {
    expect(taxFreeHint('2026-10-31')).toMatch(/at the till/);
    expect(taxFreeHint('2026-11-01')).toMatch(/Haneda/);
  });
  it('files small-hours spending under the night before', () => {
    expect(defaultSpendDay({ isoDate: '2026-10-25', hhmm: '01:30' }, tripDays)).toBe('2026-10-24');
    expect(defaultSpendDay({ isoDate: '2026-10-25', hhmm: '04:00' }, tripDays)).toBe('2026-10-25');
    expect(defaultSpendDay({ isoDate: '2026-11-01', hhmm: '01:30' }, tripDays)).toBe('2026-10-31');
    // Outside the trip: the nearest end.
    expect(defaultSpendDay({ isoDate: '2026-10-14', hhmm: '12:00' }, tripDays)).toBe('2026-10-24');
    expect(defaultSpendDay({ isoDate: '2026-11-05', hhmm: '12:00' }, tripDays)).toBe('2026-11-02');
  });
  it('keeps a 1 Nov small-hours tax-free buy on 1 Nov (new rules)', () => {
    expect(defaultSpendDay({ isoDate: '2026-11-01', hhmm: '01:30' }, tripDays, true)).toBe('2026-11-01');
    expect(defaultSpendDay({ isoDate: '2026-11-02', hhmm: '01:30' }, tripDays, true)).toBe('2026-11-01');
    expect(defaultSpendDay({ isoDate: '2026-10-25', hhmm: '01:30' }, tripDays, true)).toBe('2026-10-24');
  });
});
