'use client';
import { useMemo, useState } from 'react';
import { AirplaneTilt, Bed, Coins, Paperclip, Receipt, Train, Wallet } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { useShell } from '@/components/shell/AppShell';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Converter } from '@/components/money/Converter';
import { ShoppingList } from '@/components/money/ShoppingList';
import { CashExchangeCard } from '@/components/money/CashExchange';
import { TripNotice, TripSkeleton } from '@/components/ui/States';
import { CATEGORY_UI } from '@/components/money/categories';
import { budgetCompare, isEstimate, perPerson, settleUp, toRm, totals, type Expense } from '@/lib/money/compute';
import type { PrePayment } from '@/lib/sheet/types';
import { NEW_TAX_FREE_FROM, toJpy } from '@/lib/money/today';
import { jpy, rm, rm0, shortDate, shortRm } from '@/lib/format';

const WHO = { alex: 'Alex', sam: 'Sam', shared: 'both' } as const;
const WITH = { cash: 'cash', wise: 'Wise', card: 'card' } as const;
const SECTION_LABEL: Record<string, string> = {
  FLIGHTS: 'Flights',
  ACCOMMODATION: 'Hotels',
  TRANSPORT: 'Transport',
  FOOD: 'Food',
  ACTIVITIES: 'Activities',
  MISC: 'Shopping & other',
};

export default function MoneyPage() {
  const { trip } = useTripData();
  const [tab, setTab] = useState<'log' | 'summary' | 'shopping'>('log');
  const [converter, setConverter] = useState(false);
  if (!trip)
    return (
      <>
        <TripNotice />
        <TripSkeleton />
      </>
    );
  return (
    <div className="mx-auto max-w-3xl">
      <header className="grid gap-4 pt-2 pb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[40px] leading-none font-semibold tracking-tight">Money</h1>
          <button
            onClick={() => setConverter(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold active:scale-[0.98]"
          >
            ¥ ⇄ RM
          </button>
        </div>
        <Segmented
          label="View"
          hideLabel
          value={tab}
          onChange={setTab}
          options={[
            { value: 'log', label: 'Spending' },
            { value: 'summary', label: 'Summary' },
            { value: 'shopping', label: 'Shopping' },
          ]}
        />
      </header>
      {tab === 'log' ? <ExpenseLog /> : tab === 'summary' ? <Summary /> : <ShoppingList />}
      <Sheet open={converter} onClose={() => setConverter(false)} title="Yen and ringgit">
        <Converter rate={trip.jpyPerRm} onLog={() => setConverter(false)} />
      </Sheet>
    </div>
  );
}

function ExpenseLog() {
  const { expenses, trip, files, rates } = useTripData();
  const { openQuickAdd } = useShell();
  const rate = rates!;
  const withReceipt = new Set(files.filter((f) => f.kind === 'receipt').map((f) => f.expense_client_id));

  const groups = useMemo(() => {
    const by = new Map<string, Expense[]>();
    for (const e of expenses) by.set(e.spent_on, [...(by.get(e.spent_on) ?? []), e]);
    return [...by].sort(([a], [b]) => b.localeCompare(a));
  }, [expenses]);

  if (!expenses.length)
    return (
      <div className="grid gap-8">
        <div className="grid justify-items-start gap-3 rounded-[28px] border border-dashed border-line p-6">
          <Wallet size={32} className="text-accent-text" />
          <h2 className="text-xl font-semibold tracking-tight">Nothing logged yet</h2>
          <p className="max-w-[40ch] text-[15px] text-ink-soft">
            Tap Expense after you pay for something. It saves even without signal and syncs to both phones.
          </p>
          <button
            onClick={() => openQuickAdd()}
            className="mt-1 min-h-12 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink active:scale-[0.98]"
          >
            Log the first one
          </button>
        </div>
        <CashExchangeCard />
        <BookedBefore payments={trip!.prePayments} />
      </div>
    );

  const dayNumber = (iso: string) => trip!.days.find((d) => d.isoDate === iso)?.day;

  return (
    <div className="grid gap-6">
      {groups.map(([iso, list]) => {
        const dayRm = list.reduce((s, e) => s + toRm(e, rate), 0);
        return (
          <section key={iso}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">
                {dayNumber(iso) ? `Day ${dayNumber(iso)} · ` : ''}
                {shortDate(iso)}
              </h2>
              <span className="tabular text-sm text-ink-faint">{rm(dayRm)}</span>
            </div>
            <ul className="overflow-hidden rounded-[24px] border border-line bg-card">
              {list.map((e, i) => {
                const { Icon, label } = CATEGORY_UI[e.category];
                return (
                  <li key={e.client_id} className={i ? 'border-t border-line' : ''}>
                    <button
                      onClick={() => openQuickAdd({ expense: e })}
                      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-sunk"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
                        <Icon size={20} />
                      </span>
                      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-medium">{e.note || label}</span>
                          {withReceipt.has(e.client_id) && (
                            <Paperclip size={14} className="shrink-0 text-ink-faint" aria-label="Receipt saved" />
                          )}
                          {e.tax_free && (
                            <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-text">
                              Tax-free
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {WHO[e.paid_by]} paid with {WITH[e.paid_with] ?? 'cash'}
                          {e.for_whom !== 'shared' ? `, for ${WHO[e.for_whom]}` : ''}
                        </span>
                      </span>
                      <span className="tabular grid shrink-0 text-right">
                        <span className="text-[15px] font-semibold">{e.currency === 'JPY' ? jpy(e.amount) : rm(e.amount)}</span>
                        {e.currency === 'JPY' && (
                          <span className="text-xs text-ink-faint">
                            {isEstimate(e) ? <span aria-label="estimate">≈ </span> : null}
                            {rm(toRm(e, rate))}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {expenses.some(isEstimate) && (
        <p className="-mt-3 text-xs text-ink-faint">≈ card amounts are estimates. Tap one to add what the bank charged.</p>
      )}
      <CashExchangeCard />
      <BookedBefore payments={trip!.prePayments} />
    </div>
  );
}

const PRE_UI: Record<string, { Icon: typeof Bed; label: (desc: string) => string }> = {
  flight: { Icon: AirplaneTilt, label: (d) => `Flight, ${d}` },
  hotel: { Icon: Bed, label: (d) => `Hotel, ${d}` },
  train: { Icon: Train, label: (d) => d },
  cash: { Icon: Coins, label: () => 'Wise yen top-up' },
};

/** Flights, hotels, train tickets and the Wise cash float, read from the sheet's Payment tab. */
function BookedBefore({ payments }: { payments: PrePayment[] }) {
  if (!payments.length) return null;
  const spent = payments.filter((p) => p.type.toLowerCase() !== 'cash').reduce((s, p) => s + p.amountRm, 0);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Booked before the trip</h2>
        <span className="tabular text-sm text-ink-faint">{rm(spent)}</span>
      </div>
      <ul className="overflow-hidden rounded-[24px] border border-line bg-card">
        {payments.map((p, i) => {
          const ui = PRE_UI[p.type.toLowerCase()] ?? { Icon: Wallet, label: (d: string) => `${p.type}, ${d}` };
          const isCash = p.type.toLowerCase() === 'cash';
          return (
            <li
              key={`${p.type}-${p.desc}-${i}`}
              className={`flex min-h-16 items-center gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
                <ui.Icon size={20} />
              </span>
              <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
                <span className="truncate text-[15px] font-medium">{ui.label(p.desc)}</span>
                <span className="text-xs text-ink-faint">
                  {isCash ? `${WHO[p.payer]} loaded it, not counted as spending` : `${WHO[p.payer]} paid`}
                </span>
              </span>
              <span className={`tabular shrink-0 text-[15px] font-semibold ${isCash ? 'text-ink-faint' : ''}`}>
                {rm(p.amountRm)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-faint">
        From the Payment tab in the sheet. The Wise top-up is money moved, not spent: log what it paid for as expenses.
      </p>
    </section>
  );
}

function Summary() {
  const { expenses, trip, rates } = useTripData();
  const { prePayments, budget, days } = trip!;
  const t = totals(expenses, prePayments, rates!);
  const rows = budgetCompare(expenses, prePayments, budget, rates!);
  const each = perPerson(expenses, prePayments, rates!);
  const owed = settleUp(expenses, rates!);
  const owedAll = settleUp(expenses, rates!, prePayments);
  const budgetTotal = rows.reduce((s, r) => s + r.budgetRm, 0);
  const maxDay = Math.max(1, ...days.map((d) => t.byDay[d.isoDate] ?? 0));

  return (
    <div className="grid gap-8">
      <section className="rounded-[28px] bg-accent p-6 text-accent-ink shadow-soft">
        <p className="text-sm font-medium opacity-80">Our trip together</p>
        <p className="tabular mt-1 text-[44px] leading-none font-semibold tracking-tight">{rm0(t.allRm)}</p>
        <p className="tabular mt-2 text-[15px] opacity-85">
          {rm0(t.tripRm)} in Japan, {rm0(t.preRm)} booked before
        </p>
        {budgetTotal > 0 && (
          <p className="tabular mt-4 text-sm opacity-80">
            Planned {rm0(budgetTotal)} ·{' '}
            {t.allRm <= budgetTotal
              ? `${rm0(budgetTotal - t.allRm)} still in the plan`
              : `${rm0(t.allRm - budgetTotal)} over the plan`}
          </p>
        )}
      </section>

      <section aria-label="Each of us">
        <dl className="grid grid-cols-2 gap-3">
          {(['alex', 'sam'] as const).map((p) => (
            <div key={p} className="rounded-[24px] border border-line bg-card p-4">
              <dt className="text-sm font-medium text-ink-faint">{WHO[p]} spent</dt>
              <dd className="tabular mt-1 text-2xl font-semibold tracking-tight">{rm0(each[p].spent)}</dd>
              <dd className="tabular mt-1 text-xs leading-relaxed text-ink-faint">
                Own {rm0(each[p].own)}
                <br />
                Shared {rm0(each[p].sharedHalf)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-faint">
          Half of everything shared (flights, hotels, meals) plus anything bought just for that person.
        </p>
      </section>

      {expenses.length > 0 && (
        <section aria-label="Settle up" className="rounded-[24px] border border-line bg-card p-4">
          <p className="text-sm font-medium text-ink-faint">Settle up · spending in Japan</p>
          <p className="tabular mt-1 text-xl font-semibold tracking-tight">
            {owed ? `${WHO[owed.from]} owes ${WHO[owed.to]} ${rm(owed.rm)}` : "We're square"}
          </p>
          {prePayments.length > 0 && (
            <p className="tabular mt-1 text-xs text-ink-faint">
              With bookings before the trip:{' '}
              {owedAll ? `${WHO[owedAll.from]} owes ${WHO[owedAll.to]} ${rm(owedAll.rm)}` : 'square'}
            </p>
          )}
          <p className="mt-2 text-xs text-ink-faint">
            Shared costs split in half; anything bought for the other person is owed in full.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Actual vs plan</h2>
        <ul className="grid gap-4">
          {rows.map((r) => {
            const pct = r.budgetRm ? Math.min(1, r.actualRm / r.budgetRm) : 0;
            return (
              <li key={r.section} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium">{SECTION_LABEL[r.section] ?? r.section}</span>
                  <span className="tabular text-sm text-ink-soft">
                    {rm0(r.actualRm)} <span className="text-ink-faint">of {rm0(r.budgetRm)}</span>
                    {r.actualRm > r.budgetRm && <span className="ml-1 font-medium text-ink">· over</span>}
                  </span>
                </div>
                <span className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(2, pct * 100)}%` }} />
              </li>
            );
          })}
        </ul>
      </section>

      <TaxFree />

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Day by day <span className="text-sm font-normal text-ink-faint">(RM)</span>
        </h2>
        <div
          className="grid h-40 grid-cols-10 items-end gap-1.5"
          role="img"
          aria-label={`Spending per trip day: ${days.map((d) => `Day ${d.day} ${rm(t.byDay[d.isoDate] ?? 0)}`).join(', ')}`}
        >
          {days.map((d) => {
            const v = t.byDay[d.isoDate] ?? 0;
            return (
              <div key={d.day} className="grid h-full grid-rows-[1fr_auto] items-end gap-1 text-center">
                {/* Amount sits on top of the bar (phones have no hover); bars stop at 85% to leave it room. */}
                <div className="flex h-full flex-col justify-end">
                  {v > 0 && <span className="tabular mb-0.5 text-[10px] leading-none text-ink-soft">{shortRm(v)}</span>}
                  <div
                    className="w-full rounded-t-lg bg-accent"
                    style={{ height: `${v ? Math.max(4, (v / maxDay) * 85) : 0}%` }}
                  />
                </div>
                <span className="tabular text-xs text-ink-faint">{d.day}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Tax-free shopping. From 1 Nov the refund is claimed at Haneda, so list what to show customs. */
function TaxFree() {
  const { expenses, rates, trip } = useTripData();
  const { openQuickAdd } = useShell();
  const list = expenses.filter((e) => e.tax_free);
  if (!list.length) return null;
  const toClaim = list.filter((e) => e.spent_on >= NEW_TAX_FREE_FROM);
  const atTill = list.length - toClaim.length;
  // Anything logged in ringgit counts too, in yen at the rate it was paid at (so the total is approximate).
  const sumJpy = Math.round(toClaim.reduce((s, e) => s + toJpy(e, rates ?? trip?.jpyPerRm ?? 38.7), 0));
  const approx = toClaim.some((e) => e.currency !== 'JPY') ? '~' : '';
  return (
    <section className="grid gap-3 rounded-[24px] border border-line bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Receipt size={20} className="text-accent-text" />
        Tax-free
      </h2>
      {atTill > 0 && (
        <p className="text-sm text-ink-soft">
          {atTill} {atTill === 1 ? 'purchase' : 'purchases'} up to 31 Oct, with the tax taken off at the till.
        </p>
      )}
      {toClaim.length > 0 && (
        <>
          <p className="text-sm text-ink-soft">
            Claim at the Haneda customs kiosk before check-in ({approx}
            {jpy(sumJpy)}). Keep the goods unopened in hand luggage.
          </p>
          <ul className="divide-y divide-line">
            {toClaim.map((e) => (
              <li key={e.client_id}>
                <button
                  onClick={() => openQuickAdd({ expense: e })}
                  className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-[15px]"
                >
                  <span className="truncate">{e.note || 'Shopping'}</span>
                  <span className="tabular shrink-0 font-semibold">{e.currency === 'JPY' ? jpy(e.amount) : rm(e.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
