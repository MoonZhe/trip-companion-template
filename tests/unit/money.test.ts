import { describe, expect, it } from 'vitest';
import { budgetCompare, isEstimate, perPerson, settleUp, sumAmount, toRm, totals, type Expense } from '@/lib/money/compute';
import type { BudgetLine, PrePayment, RawSheet } from '@/lib/sheet/types';
import { parseExchange, parseTrip } from '@/lib/sheet/parse';
import { exchangeRow, historyLine, rateOf, readTotals, sameTotals } from '@/lib/money/exchange';
import fixture from '../fixtures/sheet.json';

const RATE = 38.7;
let n = 0;
const exp = (p: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  client_id: `c${n}`,
  spent_on: '2026-10-24',
  amount: 100,
  currency: 'MYR',
  category: 'food',
  paid_by: 'alex',
  paid_with: 'cash',
  for_whom: 'shared',
  note: null,
  ...p,
});

describe('toRm', () => {
  it('converts yen with the sheet rate and keeps ringgit', () => {
    expect(toRm({ amount: 3870, currency: 'JPY' }, RATE)).toBeCloseTo(100);
    expect(toRm({ amount: 12.5, currency: 'MYR' }, RATE)).toBe(12.5);
  });
});

describe('totals', () => {
  it('sums trip expenses (incl. cash), pre-trip flights/hotels, and excludes the cash float', () => {
    const pre: PrePayment[] = [
      { type: 'Flight', desc: 'KL to JP', amountRm: 1000, payer: 'alex' },
      { type: 'Cash', desc: 'Wise JPY', amountRm: 2000, payer: 'sam' },
    ];
    const t = totals(
      [exp({ amount: 3870, currency: 'JPY', spent_on: '2026-10-25' }), exp({ paid_by: 'sam', paid_with: 'wise', amount: 50 })],
      pre,
      RATE,
    );
    expect(t.tripRm).toBeCloseTo(150);
    expect(t.preRm).toBe(1000);
    expect(t.allRm).toBeCloseTo(1150);
    expect(t.byDay['2026-10-25']).toBeCloseTo(100);
  });
});

describe('budgetCompare', () => {
  it('maps categories to budget sections', () => {
    const budget: BudgetLine[] = [
      { section: 'FOOD', item: 'Lunches', jpy: 3870, rm: 100 },
      { section: 'MISC', item: 'Souvenirs', jpy: null, rm: 50 },
      { section: 'FLIGHTS', item: 'KL→KIX', jpy: null, rm: 1000 },
    ];
    const pre: PrePayment[] = [{ type: 'Flight', desc: 'x', amountRm: 900, payer: 'alex' }];
    const rows = budgetCompare(
      [exp({ category: 'shopping', amount: 20 }), exp({ category: 'food', amount: 30 })],
      pre,
      budget,
      RATE,
    );
    expect(rows).toEqual([
      { section: 'FOOD', budgetRm: 100, actualRm: 30 },
      { section: 'MISC', budgetRm: 50, actualRm: 20 },
      { section: 'FLIGHTS', budgetRm: 1000, actualRm: 900 },
    ]);
  });
});

describe('perPerson', () => {
  it('adds personal spending to half of everything shared, ignoring the Wise top-up', () => {
    const pre: PrePayment[] = [
      { type: 'Hotel', desc: 'Osaka', amountRm: 800, payer: 'alex' },
      { type: 'Cash', desc: 'Wise', amountRm: 2000, payer: 'sam' },
    ];
    const r = perPerson([exp({ amount: 100, paid_by: 'sam' }), exp({ amount: 30, for_whom: 'sam' })], pre, RATE);
    expect(r.alex).toEqual({ spent: 450, own: 0, sharedHalf: 450 });
    expect(r.sam).toEqual({ spent: 480, own: 30, sharedHalf: 450 });
  });
});

describe('settleUp', () => {
  it('splits shared payments in half and personal ones to that person', () => {
    // Alex paid 100 shared (Sam owes 50) and 30 for Sam (owes 30); Sam paid 40 for Alex (Alex owes 40).
    const r = settleUp(
      [exp({ amount: 100 }), exp({ amount: 30, for_whom: 'sam' }), exp({ amount: 40, paid_by: 'sam', for_whom: 'alex' })],
      RATE,
    );
    expect(r).toEqual({ from: 'sam', to: 'alex', rm: 40 });
  });
  it("ignores what someone paid for themself, and is square when it evens out", () => {
    expect(settleUp([exp({ amount: 500, for_whom: 'alex' }), exp({ amount: 60 }), exp({ amount: 60, paid_by: 'sam' })], RATE)).toBeNull();
  });
  it('can count bookings before the trip, but not the Wise float', () => {
    const pre: PrePayment[] = [
      { type: 'Hotel', desc: 'Osaka', amountRm: 800, payer: 'sam' },
      { type: 'Cash', desc: 'Wise', amountRm: 2000, payer: 'alex' },
    ];
    expect(settleUp([exp({ amount: 100 })], RATE, pre)).toEqual({ from: 'alex', to: 'sam', rm: 350 });
  });
});

describe('sumAmount', () => {
  it.each([
    ['1500', 1500],
    ['1,500', 1500],
    ['50 + 50 + 50', 150],
    ['50+50+', 100],
    ['12.5 + 7.5', 20],
    ['200 - 50', 150],
    ['100 + 50 - 30 -', 120],
    ['0.1 + 0.2', 0.3],
  ])('%s → %d', (text, want) => expect(sumAmount(text)).toBe(want));
  it.each(['', '+', '50 ++ 50', '50 +- 50', '1.2.3'])('%s is not a number', (text) => expect(sumAmount(text)).toBeNaN());
});

describe('rates per payment method', () => {
  const rates = { base: 38.7, cash: { alex: 37.5, sam: 36 } };
  it("converts cash at the payer's own exchange rate and cards at the base rate", () => {
    expect(toRm(exp({ currency: 'JPY', amount: 3750, paid_with: 'cash', paid_by: 'alex' }), rates)).toBeCloseTo(100);
    expect(toRm(exp({ currency: 'JPY', amount: 3600, paid_with: 'cash', paid_by: 'sam' }), rates)).toBeCloseTo(100);
    expect(toRm(exp({ currency: 'JPY', amount: 3870, paid_with: 'card' }), rates)).toBeCloseTo(100);
    expect(toRm(exp({ currency: 'JPY', amount: 3870, paid_with: 'wise' }), rates)).toBeCloseTo(100);
  });
  it("converts Wise at the payer's own top-up rate, then the other person's", () => {
    const withWise = { ...rates, wise: { alex: 38.46, sam: null } };
    expect(toRm(exp({ currency: 'JPY', amount: 3846, paid_with: 'wise', paid_by: 'alex' }), withWise)).toBeCloseTo(100);
    expect(toRm(exp({ currency: 'JPY', amount: 3846, paid_with: 'wise', paid_by: 'sam' }), withWise)).toBeCloseTo(100);
    expect(toRm(exp({ currency: 'JPY', amount: 3750, paid_with: 'cash', paid_by: 'alex' }), withWise)).toBeCloseTo(100);
  });
  it("uses the other person's rate, then the base rate, until the payer has changed money", () => {
    const alexOnly = { base: 38.7, cash: { alex: 37.5, sam: null } };
    expect(toRm(exp({ currency: 'JPY', amount: 3750, paid_with: 'cash', paid_by: 'sam' }), alexOnly)).toBeCloseTo(100);
    const none = { base: 38.7, cash: { alex: null, sam: null } };
    expect(toRm(exp({ currency: 'JPY', amount: 3870, paid_with: 'cash', paid_by: 'sam' }), none)).toBeCloseTo(100);
  });
  it('uses what the bank actually charged when we have it', () => {
    expect(toRm(exp({ currency: 'JPY', amount: 500, paid_with: 'card', charged_rm: 14 }), rates)).toBe(14);
  });
  it('flags card amounts that are still estimates', () => {
    expect(isEstimate(exp({ currency: 'JPY', paid_with: 'card' }))).toBe(true);
    expect(isEstimate(exp({ currency: 'JPY', paid_with: 'card', charged_rm: 14 }))).toBe(false);
    expect(isEstimate(exp({ currency: 'JPY', paid_with: 'cash' }))).toBe(false);
  });
});

describe('parseExchange', () => {
  const rows = [
    ['Train', 'Shinkansen', '738.21', 'Alex'],
    [],
    ['💴  CASH EXCHANGE'],
    ['Who', 'RM paid', '¥ received', '¥ per RM', '¥ changed back', 'RM got back', 'History'],
    ['Alex', '1000', '37500', '37.5', '5000', '125.5', '17 Oct: +RM 1,000 → ¥37,500'],
    ['Sam', '', '', ''],
    [],
    ['💳  WISE TOP-UPS'],
    ['Who', 'RM topped up', '¥ received', '¥ per RM', '¥ changed back', 'RM got back', 'History'],
    ['Alex', '2,000.00', '76912', '38.46'],
    ['Sam', '2,050.00', '', ''],
  ];
  it('reads each person, null until they have entered anything', () => {
    expect(parseExchange(rows, 'cash')).toEqual({
      alex: { rm: 1000, jpy: 37500, backJpy: 5000, backRm: 125.5, history: '17 Oct: +RM 1,000 → ¥37,500' },
      sam: null,
    });
  });
  it('tells the Wise block from the cash block, and keeps a top-up with no yen yet', () => {
    expect(parseExchange(rows, 'wise')).toEqual({ alex: { rm: 2000, jpy: 76912 }, sam: { rm: 2050, jpy: 0 } });
    expect(rateOf({ rm: 2050, jpy: 0 })).toBeNull();
    expect(rateOf({ rm: 2000, jpy: 76912 })).toBeCloseTo(38.456);
  });
  it('is empty without the block', () => expect(parseExchange(rows.slice(0, 2))).toEqual({ alex: null, sam: null }));
  it("isn't read as a pre-trip payment", () => {
    expect(parseTrip({ ...(fixture as RawSheet), payment: rows }).prePayments.map((p) => p.type)).toEqual(['Train']);
  });
  it('finds the row to write and compares totals', () => {
    expect(exchangeRow(rows, 'wise', 'sam')).toBe(10);
    expect(exchangeRow(rows, 'cash', 'sam')).toBe(5);
    expect(sameTotals(readTotals(rows[9]), { rm: 2000, jpy: 76912, backJpy: 0, backRm: 0 })).toBe(true);
    expect(sameTotals(readTotals(rows[9]), { rm: 0, jpy: 0, backJpy: 0, backRm: 0 })).toBe(false);
  });
  it('writes a dated history line', () => {
    expect(historyLine('2026-10-17', { rm: 2000, jpy: 76912 })).toBe('17 Oct: +RM 2,000 → ¥76,912');
    expect(historyLine('2026-11-03', { backJpy: 5000, backRm: 120.5 })).toBe('3 Nov: ¥5,000 back → RM 120.50');
  });
});
