'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowsLeftRight, Camera, Minus, PencilSimple, Plus, Receipt, Trash } from '@phosphor-icons/react';
import { AttachButton, FileViewer } from '@/components/files/Files';
import { PhotoThumb } from '@/components/itinerary/DayPhotos';
import type { TripFile } from '@/lib/files/store';
import { defaultSpendDay, taxFreeHint } from '@/lib/money/today';
import { Sheet } from '@/components/ui/Sheet';
import { useTripData } from '@/components/providers/TripData';
import { CATEGORIES, rateFor, sumAmount, toRm, type Category, type Expense } from '@/lib/money/compute';
import { tokyoClock } from '@/lib/time/now';
import { useNow } from '@/lib/time/useNow';
import { jpy, rm, shortDate } from '@/lib/format';
import { useShell } from '@/components/shell/AppShell';
import { useArmed } from '@/lib/ui/useArmed';
import { CATEGORY_UI } from './categories';

export interface QuickAddDraft {
  expense?: Expense;
  category?: Category;
  note?: string;
  amount?: number;
  currency?: Expense['currency'];
  /** The trip day it belongs to (ISO date), e.g. the day of the stop it was logged from. */
  day?: string;
}

const PAID_WITH_KEY = 'paid-with';
/** New-expense forms currently open (by client id). */
const OPEN_FORMS = new Set<string>();
/** Where the "Bought tax-free" switch is offered. */
const TAX_FREE_CATEGORIES: Category[] = ['shopping', 'other'];

/** How this phone last paid, so Wise or card users aren't switching from Cash every time. */
function lastPaidWith(): Expense['paid_with'] {
  try {
    const v = localStorage.getItem(PAID_WITH_KEY);
    if (v === 'cash' || v === 'wise' || v === 'card') return v;
  } catch {}
  return 'cash';
}

export function QuickAddSheet({ draft, openId, onClose }: { draft: QuickAddDraft | null; openId: number; onClose: () => void }) {
  // Something's been typed: only the ✕ (or Save) closes the sheet then.
  const [dirty, setDirty] = useState<number | null>(null);
  return (
    <Sheet
      open={!!draft}
      onClose={onClose}
      dismissible={dirty !== openId}
      title={draft?.expense ? 'Edit expense' : 'Add expense'}
      // Up here it stays in reach above the iPhone number pad, which has no Return key.
      action={
        <button
          type="submit"
          form="quick-add"
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink active:scale-[0.98]"
        >
          Save
        </button>
      }
    >
      {draft && <QuickAddForm key={openId} draft={draft} onClose={onClose} onDirty={(d) => setDirty(d ? openId : null)} />}
    </Sheet>
  );
}

function QuickAddForm({
  draft,
  onClose,
  onDirty,
}: {
  draft: QuickAddDraft;
  onClose: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const { trip, rates, person, files, saveExpense, deleteExpense, forgetReceipts } = useTripData();
  const { toast } = useShell();
  const editing = draft.expense;
  const now = useNow();

  const dayOptions = useMemo(
    () =>
      trip?.days.map((d) => ({
        iso: d.isoDate,
        label: `Day ${d.day} · ${shortDate(d.isoDate)}`,
      })) ?? [],
    [trip],
  );
  const tripDays = useMemo(() => dayOptions.map((d) => d.iso), [dayOptions]);
  const defaultDay = useMemo(() => defaultSpendDay(tokyoClock(now), tripDays), [tripDays, now]);

  const [amount, setAmount] = useState(editing ? String(editing.amount) : draft.amount ? String(draft.amount) : '');
  const [currency, setCurrency] = useState<Expense['currency']>(editing?.currency ?? draft.currency ?? 'JPY');
  // Known up front so a receipt photo can be attached before the expense is saved.
  const [clientId] = useState(() => editing?.client_id ?? crypto.randomUUID());
  const [taxFree, setTaxFree] = useState(editing?.tax_free ?? false);
  const [category, setCategory] = useState<Category>(editing?.category ?? draft.category ?? 'food');
  const [paidBy, setPaidBy] = useState<Expense['paid_by']>(editing?.paid_by ?? person);
  const [paidWith, setPaidWith] = useState<Expense['paid_with']>(() => editing?.paid_with ?? lastPaidWith());
  const [forWhom, setForWhom] = useState<Expense['for_whom']>(editing?.for_whom ?? 'shared');
  const [day, setDay] = useState(editing?.spent_on ?? (dayOptions.some((d) => d.iso === draft.day) ? draft.day! : defaultDay));
  const [note, setNote] = useState(editing?.note ?? draft.note ?? '');
  const [chargedRm, setChargedRm] = useState(editing?.charged_rm != null ? String(editing.charged_rm) : '');
  const [error, setError] = useState<string | null>(null);
  const [armed, arm] = useArmed();
  const amountRef = useRef<HTMLInputElement>(null);
  // How the form opened, so any change (not just the amount or note) keeps it from being swiped away.
  const [start] = useState(() => ({ currency, taxFree, category, paidBy, paidWith, forWhom, day, chargedRm }));

  // Focus the amount without letting iOS scroll the sheet to it while it's still sliding in (that
  // used to leave "What was it?" at the top with the amount and Save off screen). Same moment as
  // autoFocus, so the number pad still opens.
  useLayoutEffect(() => {
    if (!editing) amountRef.current?.focus({ preventScroll: true });
  }, [editing]);

  // Closed without saving a new expense: any receipts attached to it can go (after a grace period).
  const saved = useRef(false);
  useEffect(() => {
    if (editing) return;
    OPEN_FORMS.add(clientId);
    return () => {
      OPEN_FORMS.delete(clientId);
      // Checked a beat later: a dev-mode remount puts it straight back, and that isn't a close.
      setTimeout(() => !saved.current && !OPEN_FORMS.has(clientId) && forgetReceipts(clientId), 0);
    };
  }, [editing, clientId, forgetReceipts]);

  // In the order they were added: Receipt 1, 2, 3…
  const receipts = files
    .filter((f) => f.kind === 'receipt' && f.expense_client_id === clientId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const startAmount = editing ? String(editing.amount) : draft.amount ? String(draft.amount) : '';
  const form = { currency, taxFree, category, paidBy, paidWith, forWhom, day, chargedRm };
  const isDirty =
    amount.trim() !== startAmount ||
    note !== (editing?.note ?? draft.note ?? '') ||
    (Object.keys(start) as (keyof typeof start)[]).some((k) => start[k] !== form[k]) ||
    // A new expense's receipt photos are deleted if it's closed unsaved, so they count as typed.
    (!editing && receipts.length > 0);
  useEffect(() => onDirty(isDirty), [isDirty, onDirty]);

  // Items can be added up in the field: "50 + 50 + 50" saves 150, "200 - 50" saves 150.
  const value = sumAmount(amount);
  const isSum = /[+-]/.test(amount);
  const addOp = (op: '+' | '-') => setAmount((a) => (a.trim() ? `${a.replace(/[\s+-]+$/, '')} ${op} ` : a));
  /**
   * Handlers for a button beside the amount that mustn't close the number pad. On iPhone a tap
   * moves focus off the field (and the keyboard drops) unless the touch's default is cancelled;
   * cancelling it also stops the click, so the action runs on touchend instead. Focus goes back
   * to the field in case it slipped anyway.
   */
  const keepKeys = (run: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      run();
      document.getElementById('amount')?.focus({ preventScroll: true });
    },
    onClick: run,
  });
  const valid = Number.isFinite(value) && value > 0;
  const rate = rates ? rateFor(paidWith, rates, paidBy) : (trip?.jpyPerRm ?? 38.7);
  const converted = valid ? (currency === 'JPY' ? rm(toRm({ amount: value, currency }, rate)) : jpy(value * rate)) : null;
  // Card payments can carry what the bank actually charged; cash and Wise use our own exchange rates.
  const askCharged = currency === 'JPY' && paidWith === 'card';
  const charged = Number(chargedRm.replace(/,/g, ''));
  const chargedValid = !chargedRm.trim() || (Number.isFinite(charged) && charged > 0);
  const total = valid && isSum ? `= ${currency === 'JPY' ? jpy(value) : rm(value)} · ` : '';

  function save() {
    if (!valid) {
      setError('Enter an amount above zero');
      return;
    }
    if (askCharged && !chargedValid) {
      document.getElementById('charged')?.focus();
      return;
    }
    saved.current = true;
    const amountSaved = currency === 'JPY' ? Math.round(value) : Math.round(value * 100) / 100;
    // The bank's RM was for the old amount: if that changed and the RM wasn't touched, go back to the estimate.
    const staleCharge =
      !!editing &&
      chargedRm === start.chargedRm &&
      (amountSaved !== editing.amount || currency !== editing.currency || paidWith !== editing.paid_with);
    saveExpense({
      ...(editing ?? {}),
      id: editing?.id ?? clientId,
      client_id: clientId,
      spent_on: day,
      amount: amountSaved,
      currency,
      category,
      paid_by: paidBy,
      paid_with: paidWith,
      for_whom: forWhom,
      note: note.trim() || null,
      tax_free: taxFree,
      charged_rm: askCharged && chargedRm.trim() && !staleCharge ? Math.round(charged * 100) / 100 : null,
    });
    try {
      localStorage.setItem(PAID_WITH_KEY, paidWith);
    } catch {}
    const label = `${currency === 'JPY' ? jpy(amountSaved) : rm(amountSaved)} · ${note.trim() || CATEGORY_UI[category].label}`;
    if (editing) toast(`Saved ${label}`);
    else toast(`Logged ${label}`, () => deleteExpense(clientId));
    onClose();
  }

  return (
    <form
      id="quick-add"
      className="grid gap-6 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-2">
        <label htmlFor="amount" className="text-sm font-medium text-ink-soft">
          Amount
        </label>
        <div className="flex items-center gap-2 rounded-2xl bg-sunk pr-2 pl-3 focus-within:ring-2 focus-within:ring-accent">
          <button
            type="button"
            {...keepKeys(() => setCurrency((c) => (c === 'JPY' ? 'MYR' : 'JPY')))}
            aria-label={currency === 'JPY' ? 'Yen. Switch to ringgit' : 'Ringgit. Switch to yen'}
            className="-ml-1 flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-1 text-3xl font-semibold text-ink-faint active:scale-95"
          >
            {currency === 'JPY' ? '¥' : 'RM'}
            <ArrowsLeftRight size={14} weight="bold" />
          </button>
          <input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            ref={amountRef}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.,+\- ]/g, ''));
              setError(null);
            }}
            // Shrinks as a sum gets long ("1200 + 800 + 450"), so all of it stays in view.
            className={`tabular min-h-16 w-full min-w-0 bg-transparent font-semibold tracking-tight outline-none placeholder:text-ink-faint ${
              amount.length > 14 ? 'text-xl' : amount.length > 9 ? 'text-2xl' : 'text-4xl'
            }`}
            placeholder="0"
            aria-describedby="amount-help"
            aria-invalid={!!error}
          />
          {/* The iPhone number pad has no + or −, so add them here (one slim pill). Keeps the keyboard up. */}
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
        <p
          id="amount-help"
          role={error ? 'alert' : undefined}
          className={`tabular text-sm ${error ? 'text-warn' : 'text-ink-faint'}`}
        >
          {error ?? (converted ? `${total}About ${converted}` : `Rate RM 1 = ¥${rate.toFixed(2)}`)}
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium text-ink-soft">Category</legend>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.filter((c) => c !== 'hotel' || editing?.category === 'hotel').map((c) => {
            const { label, Icon } = CATEGORY_UI[c];
            const on = c === category;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCategory(c);
                  // Tax-free is for shopping: a switch left on from Shopping mustn't file a meal for the
                  // Haneda claim. An expense already saved as tax-free in that category keeps it.
                  if (!TAX_FREE_CATEGORIES.includes(c) && !(editing?.tax_free && editing.category === c)) setTaxFree(false);
                }}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-sm font-medium transition active:scale-[0.97] ${
                  on ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-soft'
                }`}
              >
                <Icon size={22} weight={on ? 'fill' : 'regular'} />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <label htmlFor="note" className="text-sm font-medium text-ink-soft">
          What was it? <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <input
          id="note"
          value={note}
          maxLength={120}
          onChange={(e) => setNote(e.target.value)}
          autoCapitalize="sentences"
          enterKeyHint="done"
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-[16px] outline-none focus:ring-2 focus:ring-accent"
          placeholder="Restaurant, shop or ticket"
        />
      </div>

      {(TAX_FREE_CATEGORIES.includes(category) || taxFree) && (
        <div className="grid gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={taxFree}
            onClick={() => {
              const on = !taxFree;
              setTaxFree(on);
              // Logged in the small hours of 1 Nov: the 4am rollover would file it under the old till rules.
              if (!editing && day === defaultSpendDay(tokyoClock(now), tripDays, !on)) {
                setDay(defaultSpendDay(tokyoClock(now), tripDays, on));
              }
            }}
            className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition ${
              taxFree ? 'border-accent bg-accent-soft' : 'border-line'
            }`}
          >
            <Receipt size={22} weight={taxFree ? 'fill' : 'regular'} className="shrink-0 text-accent-text" />
            <span className="flex-1 text-[15px] font-medium">Bought tax-free</span>
            <span aria-hidden className={`relative h-7 w-12 rounded-full transition ${taxFree ? 'bg-accent' : 'bg-line'}`}>
              <span
                className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${taxFree ? 'left-6' : 'left-1'}`}
              />
            </span>
          </button>
          <p className="text-xs leading-relaxed text-ink-faint">{taxFreeHint(day)}</p>
        </div>
      )}

      {/* Who paid, how, for whom and which day: usually right as they are, but always in view so a
          glance confirms them and a fix is one tap. */}
      <div className="grid gap-2">
        <PillRow
          label="Paid by"
          value={paidBy}
          onChange={setPaidBy}
          options={[
            { value: 'alex', label: 'Alex' },
            { value: 'sam', label: 'Sam' },
          ]}
        />
        <PillRow
          label="With"
          value={paidWith}
          onChange={setPaidWith}
          options={[
            { value: 'cash', label: 'Cash' },
            { value: 'wise', label: 'Wise' },
            { value: 'card', label: 'Card' },
          ]}
        />
        {askCharged && (
          <div className="flex items-center gap-3">
            <label htmlFor="charged" className="w-16 shrink-0 text-sm leading-tight text-ink-soft">
              Bank RM
            </label>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:ring-2 focus-within:ring-accent">
              <span className="text-[15px] text-ink-faint">RM</span>
              <input
                id="charged"
                inputMode="decimal"
                autoComplete="off"
                value={chargedRm}
                onChange={(e) => setChargedRm(e.target.value.replace(/[^\d.,]/g, ''))}
                className="tabular min-h-11 w-full min-w-0 bg-transparent text-[16px] outline-none placeholder:text-ink-faint"
                placeholder={valid ? `${toRm({ amount: value, currency }, rate).toFixed(2)} (estimate)` : 'optional'}
                aria-describedby="charged-help"
                aria-invalid={!chargedValid}
              />
            </div>
          </div>
        )}
        {askCharged && !chargedValid && (
          <p id="charged-help" className="text-xs text-warn">
            Enter an amount above zero, or leave it empty
          </p>
        )}
        <PillRow
          label="For"
          value={forWhom}
          onChange={setForWhom}
          options={[
            { value: 'shared', label: 'Both' },
            { value: 'alex', label: 'Alex' },
            { value: 'sam', label: 'Sam' },
          ]}
        />
        <div className="flex items-center gap-3">
          <label htmlFor="day" className="w-16 shrink-0 text-sm text-ink-soft">
            Day
          </label>
          <select
            id="day"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-[16px]"
          >
            {dayOptions.map((d) => (
              <option key={d.iso} value={d.iso}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium text-ink-soft">
          Receipt <span className="font-normal text-ink-faint">(optional)</span>
        </p>
        <ReceiptList receipts={receipts} />
        <AttachButton
          accept="image/*"
          multiple
          link={(i) => ({ kind: 'receipt', expense_client_id: clientId, label: `Receipt ${receipts.length + 1 + i}` })}
        >
          <Camera size={18} />
          {receipts.length ? 'Add more receipts' : 'Add receipt photos'}
        </AttachButton>
      </div>

      <div className="flex gap-3">
        {editing && (
          <button
            type="button"
            onClick={() => {
              if (!armed) return arm();
              deleteExpense(editing.client_id);
              toast(`Deleted ${editing.note || 'expense'}`, () => saveExpense(editing));
              onClose();
            }}
            className={`flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-colors active:scale-95 ${
              armed ? 'bg-warn px-5 text-warn-ink' : 'w-14 border border-line text-ink-soft'
            }`}
            aria-label={armed ? 'Tap again to delete this expense' : 'Delete expense'}
          >
            <Trash size={22} />
            {armed && 'Delete?'}
          </button>
        )}
        <button
          type="submit"
          className="min-h-14 flex-1 rounded-full bg-accent text-base font-semibold text-accent-ink transition active:scale-[0.98]"
        >
          {editing ? 'Save changes' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/** One compact line of choices: a label, then the options as a slim segmented switch. */
function PillRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-sm text-ink-soft">{label}</span>
      <div className="grid min-w-0 flex-1 auto-cols-fr grid-flow-col gap-1 rounded-xl bg-sunk p-1">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`min-h-10 rounded-lg px-2 text-[15px] font-medium transition active:scale-[0.98] ${
                on ? 'bg-card text-ink shadow-soft' : 'text-ink-soft'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A receipt's caption: what was typed for it, not the "Receipt 2" it was saved with. */
const captionOf = (f: TripFile) => (/^receipt( \d+)?$/i.test(f.label.trim()) ? '' : f.label);

/** The expense's receipts: a thumbnail (tap for full screen, swipe between them) and a caption each. */
function ReceiptList({ receipts }: { receipts: TripFile[] }) {
  const { setFileLabel } = useTripData();
  const [open, setOpen] = useState<number | null>(null);
  // The viewer's title: the caption, or "Receipt 2" when there isn't one.
  const titled = receipts.map((f, i) => ({ ...f, label: captionOf(f) || `Receipt ${i + 1}` }));
  if (!receipts.length) return null;
  return (
    <>
      <ul className="grid gap-2">
        {receipts.map((f, i) => (
          <li key={f.id} className="flex items-center gap-3">
            <PhotoThumb file={titled[i]} onOpen={() => setOpen(i)} className="size-14 shrink-0 rounded-xl" />
            <ReceiptCaption file={f} n={i + 1} onSave={(v) => setFileLabel(f.id, v || `Receipt ${i + 1}`)} />
          </li>
        ))}
      </ul>
      <FileViewer
        file={open === null ? null : (titled[open] ?? null)}
        onClose={() => setOpen(null)}
        onStep={
          receipts.length > 1
            ? (by) => setOpen((o) => (o === null ? o : (o + by + receipts.length) % receipts.length))
            : undefined
        }
      />
    </>
  );
}

function ReceiptCaption({ file, n, onSave }: { file: TripFile; n: number; onSave: (v: string) => void }) {
  const [caption, setCaption] = useState(() => captionOf(file));
  return (
    <span className="relative min-w-0 flex-1">
      <input
        value={caption}
        maxLength={120}
        enterKeyHint="done"
        autoCapitalize="sentences"
        // Enter finishes the caption; it mustn't submit (and close) the expense form.
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => caption.trim() !== captionOf(file) && onSave(caption.trim())}
        // The caption if there is one, otherwise just "Receipt 2". Tap to type one (optional).
        placeholder={`Receipt ${n}`}
        aria-label={`Caption for receipt ${n}`}
        className="min-h-11 w-full rounded-xl bg-sunk pr-9 pl-3 text-[16px] outline-none placeholder:text-ink focus:ring-2 focus:ring-accent focus:placeholder:text-ink-faint"
      />
      <PencilSimple
        aria-hidden
        size={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-faint"
      />
    </span>
  );
}
