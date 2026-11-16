'use client';
import { Wallet } from '@phosphor-icons/react';
import type { Day } from '@/lib/sheet/types';
import { useTripData } from '@/components/providers/TripData';
import { plannedJpy, spentJpy } from '@/lib/money/today';
import { jpy } from '@/lib/format';

/** Today's spending against what the sheet planned for the day. */
export function TodaySpend({ day }: { day: Day }) {
  const { trip, expenses, checks, rates } = useTripData();
  const plan = plannedJpy(day, checks);
  // Each person's cash converts at their own exchange rate, as in Summary.
  const spent = spentJpy(expenses, day.isoDate, rates ?? trip!.jpyPerRm);
  if (!plan && !spent) return null;
  const over = spent > plan;
  const pct = plan ? Math.min(1, spent / plan) : 1;
  return (
    <section className="mt-8 grid gap-2 rounded-[24px] border border-line bg-card p-5" aria-label="Today's spending">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-faint">
          <Wallet size={16} />
          Today&apos;s spending
        </p>
        <p className="tabular text-sm text-ink-faint">plan {jpy(plan)}</p>
      </div>
      <p className="tabular text-2xl font-semibold tracking-tight">
        {over ? (
          <>
            {jpy(spent - plan)} <span className="text-base font-medium text-ink-soft">over today&apos;s plan</span>
          </>
        ) : (
          <>
            {jpy(plan - spent)} <span className="text-base font-medium text-ink-soft">left today</span>
          </>
        )}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-sunk" aria-hidden>
        <div
          className={`h-full rounded-full ${over ? 'bg-warn' : 'bg-accent'}`}
          style={{ width: `${Math.max(2, pct * 100)}%` }}
        />
      </div>
      <p className="tabular text-xs text-ink-faint">{jpy(spent)} logged so far</p>
    </section>
  );
}
