'use client';
import { useState } from 'react';
import { CircleNotch, Coins } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { Segmented } from '@/components/ui/Segmented';
import type { Person } from '@/lib/allowlist';
import { jpy, rm } from '@/lib/format';
import { historyLine, rateOf, totalsOf, type ExchangeKind, type ExchangeTotals } from '@/lib/money/exchange';
import { tripClock, tripDayIndex } from '@/lib/time/now';
import { useArmed } from '@/lib/ui/useArmed';

const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : 0);
const ok = (s: string) => Number.isFinite(num(s)) && num(s) > 0;
const okOrBlank = (s: string) => Number.isFinite(num(s)) && num(s) >= 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const NAME: Record<Person, string> = { alex: 'Alex', sam: 'Sam' };
const KIND: Record<ExchangeKind, { title: string; paid: string; none: string }> = {
  cash: { title: 'Cash', paid: 'RM paid', none: 'Not changed yet' },
  wise: { title: 'Wise', paid: 'RM topped up', none: 'Not topped up yet' },
};

type Mode = 'add' | 'back' | 'totals';

/**
 * Ringgit changed into yen (cash) or topped up into Wise, fees included, and leftover yen changed back.
 * Lives in the sheet's Payment tab as running totals; each person's cash and Wise spending converts at
 * their own rate once it's set.
 */
export function CashExchangeCard() {
  const { trip } = useTripData();
  const [kind, setKind] = useState<ExchangeKind>('cash');
  if (!trip) return null;
  return (
    <section className="grid gap-3 rounded-[24px] border border-line bg-card p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <Coins size={20} className="text-accent-text" />
        Cash &amp; Wise
      </h2>
      <Segmented
        label="Cash or Wise"
        hideLabel
        value={kind}
        options={[
          { value: 'cash', label: 'Cash' },
          { value: 'wise', label: 'Wise' },
        ]}
        onChange={setKind}
      />
      <ul className="divide-y divide-line">
        {(['alex', 'sam'] as const).map((p) => (
          <ExchangeRow key={`${kind}-${p}`} kind={kind} person={p} />
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-ink-faint">
        Fees included. {KIND[kind].title} spending converts at the payer&apos;s own rate (until it&apos;s set, the other
        person&apos;s, then ¥{trip.jpyPerRm.toFixed(2)}). Saved in the sheet&apos;s Payment tab.
      </p>
    </section>
  );
}

function ExchangeRow({ kind, person }: { kind: ExchangeKind; person: Person }) {
  const { trip, saveExchange } = useTripData();
  const x = (kind === 'cash' ? trip?.cashExchange : trip?.wise)?.[person] ?? null;
  const [mode, setMode] = useState<Mode | null>(null);
  const [fields, setFields] = useState(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [armed, arm] = useArmed();
  const { paid, none } = KIND[kind];

  const pick = (m: Mode) => {
    const t = totalsOf(x);
    const show = (n: number) => (n ? String(n) : '');
    setFields(m === 'totals' ? [show(t.rm), show(t.jpy), show(t.backJpy), show(t.backRm)] : ['', '', '', '']);
    setError(null);
    setMode(m);
  };
  // After the trip, leftover yen going back is the likely next step.
  const open = () => pick(x && trip && tripDayIndex(trip.days) === 'after' ? 'back' : 'add');

  const save = async (next: ExchangeTotals | null, line?: string) => {
    setSaving(true);
    const err = await saveExchange(kind, person, { expected: totalsOf(x), next, line });
    setSaving(false);
    if (err) setError(err);
    else setMode(null);
  };

  const [f0, f1, f2, f3] = fields;
  const t = totalsOf(x);
  const submit = () => {
    const today = tripClock().isoDate;
    if (mode === 'add') {
      if (!ok(f0) || !ok(f1)) return setError('Enter both amounts');
      const add = { rm: r2(num(f0)), jpy: Math.round(num(f1)) };
      return void save({ ...t, rm: r2(t.rm + add.rm), jpy: t.jpy + add.jpy }, historyLine(today, add));
    }
    if (mode === 'back') {
      if (!ok(f0) || !ok(f1)) return setError('Enter both amounts');
      const back = { backJpy: Math.round(num(f0)), backRm: r2(num(f1)) };
      return void save({ ...t, backJpy: t.backJpy + back.backJpy, backRm: r2(t.backRm + back.backRm) }, historyLine(today, back));
    }
    if (!fields.every(okOrBlank)) return setError('Check the amounts');
    void save({ rm: r2(num(f0)), jpy: Math.round(num(f1)), backJpy: Math.round(num(f2)), backRm: r2(num(f3)) });
  };

  const rate = rateOf(x);
  if (!mode)
    return (
      <li className="flex min-h-14 items-center justify-between gap-3 py-2">
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
          <span className="text-[15px] font-medium">{NAME[person]}</span>
          <span className="tabular text-sm text-ink-faint">
            {!x || (!x.rm && !x.jpy)
              ? none
              : `${x.rm ? rm(x.rm) : 'RM not entered'} → ${x.jpy ? jpy(x.jpy) : '¥ not entered'}${
                  rate ? ` · ¥${rate.toFixed(2)} per RM` : ''
                }`}
          </span>
          {x && (x.backJpy || x.backRm) ? (
            <span className="tabular text-sm text-ink-faint">
              Changed back {jpy(x.backJpy ?? 0)} → {rm(x.backRm ?? 0)}
            </span>
          ) : null}
        </span>
        <button
          onClick={open}
          className="min-h-11 shrink-0 rounded-full border border-line px-4 text-sm font-medium active:scale-[0.98]"
        >
          {x ? 'Update' : 'Add'}
        </button>
      </li>
    );

  const inputs: [string, number][] =
    mode === 'add'
      ? [
          [paid, 0],
          ['¥ received', 1],
        ]
      : mode === 'back'
        ? [
            ['¥ changed back', 0],
            ['RM got back', 1],
          ]
        : [
            [paid, 0],
            ['¥ received', 1],
            ['¥ changed back', 2],
            ['RM got back', 3],
          ];
  const hint =
    mode === 'add'
      ? ok(f0) && ok(f1)
        ? `New totals: ${rm(t.rm + num(f0))} → ${jpy(t.jpy + num(f1))}`
        : x
          ? `Adds to the totals (${rm(t.rm)} → ${jpy(t.jpy)}).`
          : 'What you paid and got, fees included.'
      : mode === 'back'
        ? 'Leftover yen changed back into ringgit. Adds to what was changed back before.'
        : 'The running totals, as in the sheet.';

  return (
    <li className="py-3">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-[15px] font-medium">
          {NAME[person]} · {KIND[kind].title}
        </p>
        {x && (
          <Segmented
            label="What to record"
            hideLabel
            value={mode}
            options={[
              { value: 'add', label: kind === 'cash' ? 'Add more' : 'Top up' },
              { value: 'back', label: 'To RM' },
              { value: 'totals', label: 'Totals' },
            ]}
            onChange={pick}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          {inputs.map(([label, i]) => {
            const id = `cx-${kind}-${person}-${mode}-${i}`;
            return (
              <div key={id} className="grid gap-1">
                <label htmlFor={id} className="text-xs font-medium text-ink-soft">
                  {label}
                </label>
                <input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  value={fields[i]}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.,]/g, '');
                    setFields((prev) => prev.map((p, j) => (j === i ? v : p)));
                    setError(null);
                  }}
                  className="tabular min-h-12 w-full min-w-0 rounded-2xl border border-line bg-card px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
                  placeholder="0"
                />
              </div>
            );
          })}
        </div>
        <p className={`text-xs leading-relaxed ${error ? 'text-warn' : 'text-ink-faint'}`}>{error ?? hint}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink active:scale-[0.98] disabled:opacity-60"
          >
            {saving && <CircleNotch size={16} className="animate-spin" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="min-h-11 rounded-full border border-line px-4 text-sm font-medium active:scale-[0.98]"
          >
            Cancel
          </button>
          {x && mode === 'totals' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => (armed ? void save(null) : arm())}
              className={`min-h-11 rounded-full px-4 text-sm font-medium active:scale-[0.98] ${
                armed ? 'bg-warn font-semibold text-warn-ink' : 'text-ink-soft'
              }`}
            >
              {armed ? 'Clear?' : 'Clear'}
            </button>
          )}
        </div>
      </form>
    </li>
  );
}
