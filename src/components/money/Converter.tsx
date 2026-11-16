'use client';
import { useState } from 'react';
import { ArrowsDownUp, Minus, Plus, Wallet } from '@phosphor-icons/react';
import { useShell } from '@/components/shell/AppShell';
import { sumAmount } from '@/lib/money/compute';
import { jpy, rm } from '@/lib/format';

export function Converter({ rate, onLog }: { rate: number; onLog?: () => void }) {
  const { openQuickAdd } = useShell();
  const [fromYen, setFromYen] = useState(true);
  const [value, setValue] = useState('1000');
  // Prices can be added up, like in Add expense: "1200 + 800 - 300".
  const sum = sumAmount(value);
  const n = Number.isFinite(sum) && sum > 0 ? sum : 0;
  const isSum = /[+-]/.test(value);
  const out = fromYen ? rm(n / rate) : jpy(n * rate);
  const addOp = (op: '+' | '-') => setValue((a) => (a.trim() ? `${a.replace(/[\s+-]+$/, '')} ${op} ` : a));
  // Same as Add expense: a tap beside the field mustn't drop the iPhone number pad.
  const keepKeys = (run: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      run();
      document.getElementById('conv')?.focus({ preventScroll: true });
    },
    onClick: run,
  });

  return (
    <section>
      <div className="grid gap-3 rounded-[24px] border border-line bg-card p-5">
        <label htmlFor="conv" className="text-sm font-medium text-ink-soft">
          {fromYen ? 'Price in yen' : 'Amount in ringgit'}
        </label>
        <div className="flex items-center gap-3 rounded-2xl bg-sunk pr-2 pl-4 focus-within:ring-2 focus-within:ring-accent">
          <span className="text-2xl font-semibold text-ink-faint">{fromYen ? '¥' : 'RM'}</span>
          <input
            id="conv"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.,+\- ]/g, ''))}
            className={`tabular min-h-14 w-full min-w-0 bg-transparent font-semibold outline-none ${
              value.length > 14 ? 'text-xl' : value.length > 9 ? 'text-2xl' : 'text-3xl'
            }`}
          />
          {/* The iPhone number pad has no + or −. */}
          <span className="flex shrink-0 overflow-hidden rounded-full border border-line">
            {(['+', '-'] as const).map((op) => (
              <button
                key={op}
                type="button"
                {...keepKeys(() => addOp(op))}
                aria-label={op === '+' ? 'Add another amount' : 'Take away an amount'}
                className={`grid h-11 w-9 place-items-center text-ink-soft active:bg-sunk ${op === '-' ? 'border-l border-line' : ''}`}
              >
                {op === '+' ? <Plus size={16} weight="bold" /> : <Minus size={16} weight="bold" />}
              </button>
            ))}
          </span>
        </div>
        {isSum && n > 0 && <p className="tabular -mt-1 text-sm text-ink-faint">= {fromYen ? jpy(n) : rm(n)}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="tabular text-3xl font-semibold tracking-tight text-accent-text" aria-live="polite">
            {out}
          </p>
          <button
            onClick={() => setFromYen((f) => !f)}
            className="grid size-12 place-items-center rounded-full border border-line active:scale-95"
            aria-label="Swap direction"
          >
            <ArrowsDownUp size={20} />
          </button>
        </div>
        {fromYen && (
          <div className="flex flex-wrap gap-2">
            {[500, 1000, 3000, 5000, 10000].map((q) => (
              <button
                key={q}
                onClick={() => setValue(String(q))}
                className="tabular min-h-11 rounded-full border border-line px-4 text-sm font-medium active:scale-95"
              >
                {jpy(q)}
              </button>
            ))}
          </div>
        )}
        {n > 0 && (
          <button
            onClick={() => {
              onLog?.();
              openQuickAdd({ amount: n, currency: fromYen ? 'JPY' : 'MYR' });
            }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accent-ink active:scale-[0.98]"
          >
            <Wallet size={18} />
            Log {fromYen ? jpy(n) : rm(n)} as an expense
          </button>
        )}
        <p className="tabular text-xs text-ink-faint">RM 1 = ¥{rate.toFixed(2)}, from the Overview tab in the sheet</p>
      </div>
    </section>
  );
}
