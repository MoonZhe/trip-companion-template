'use client';
import { useState } from 'react';
import { ArrowSquareOut, Check, Plus, Ticket, X } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { bookAheadLevel } from '@/lib/trip/bookAhead';
import { tripClock } from '@/lib/time/now';
import { useNow } from '@/lib/time/useNow';
import { shortDate } from '@/lib/format';
import { haptic } from '@/lib/ui/haptic';
import { useArmed } from '@/lib/ui/useArmed';

interface Item {
  key: string;
  label: string;
  due: string | null;
  url: string | null;
  /** Done without a tick, because the ticket is already saved in the app. */
  auto: boolean;
  todoId?: string;
  hint?: string;
}

/** "Before we fly": our own to-dos plus every stop the sheet says to book ahead. */
export function Checklist() {
  const { trip, todos, checks, files, toggleCheck, addTodo, removeTodo } = useTripData();
  const now = useNow();
  // The trip day turns over at 04:00, like the rest of the app.
  const today = tripClock(now).isoDate;
  const [draft, setDraft] = useState('');
  const [due, setDue] = useState('');

  const booked = new Set(files.filter((f) => f.kind === 'ticket' && f.stop_key).map((f) => f.stop_key!));
  const items: Item[] = [
    ...todos.map((t) => ({ key: `todo:${t.id}`, label: t.label, due: t.due, url: t.url, auto: false, todoId: t.id })),
    ...trip!.days.flatMap((d) =>
      d.stops
        .filter((s) => bookAheadLevel(s.bookAhead) === 'book')
        .map((s) => ({
          key: `book:${s.key}`,
          // The note's first sentence, without its leading emoji ("✅ MUST BOOK: …").
          label: s.bookAhead
            .split(/(?<=[.!])\s|\n/)[0]
            .replace(/^[^\p{L}\p{N}]+/u, '')
            .slice(0, 110),
          due: null,
          url: null,
          auto: booked.has(s.key),
          hint: `Day ${d.day} · ${s.title.replace(/^\[Option [A-Z]\]\s*/, '')}. Saving its ticket ticks this off`,
        })),
    ),
  ];
  const isDone = (i: Item) => i.auto || checks.has(i.key);
  const sorted = [...items].sort(
    (a, b) => Number(isDone(a)) - Number(isDone(b)) || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
  );
  const done = items.filter(isDone).length;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Before we fly</h2>
        <span className="tabular text-sm text-ink-faint">
          {done}/{items.length} done
        </span>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-card">
        {sorted.map((i) => {
          const on = isDone(i);
          const overdue = !on && i.due && i.due < today;
          const dueToday = !on && i.due === today;
          return (
            <li key={i.key} className="flex items-center">
              <button
                onClick={() => {
                  if (i.auto) return;
                  if (!on) haptic();
                  toggleCheck(i.key);
                }}
                aria-pressed={on}
                disabled={i.auto}
                className="flex min-h-14 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition ${
                    on ? 'border-good bg-good text-good-ink' : 'border-line text-transparent'
                  }`}
                >
                  {i.auto ? <Ticket size={13} weight="fill" /> : <Check size={14} weight="bold" />}
                </span>
                <span className="grid gap-0.5">
                  <span className={`text-[15px] leading-snug ${on ? 'text-ink-faint line-through' : ''}`}>{i.label}</span>
                  {(i.due || i.hint) && !on && (
                    <span
                      className={`text-xs ${overdue ? 'font-semibold text-warn' : dueToday ? 'font-semibold text-accent-text' : 'text-ink-faint'}`}
                    >
                      {i.due ? `${overdue ? 'Overdue · ' : dueToday ? 'Today · ' : 'By '}${shortDate(i.due)}` : i.hint}
                    </span>
                  )}
                  {i.auto && <span className="text-xs text-good">Ticket saved</span>}
                </span>
              </button>
              {i.url && (
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-12 place-items-center text-ink-faint"
                  aria-label={`Open the site for ${i.label}`}
                >
                  <ArrowSquareOut size={18} />
                </a>
              )}
              {i.todoId && <RemoveTodo label={i.label} onRemove={() => removeTodo(i.todoId!)} />}
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          addTodo(draft.trim(), due || null);
          setDraft('');
          setDue('');
        }}
      >
        <label htmlFor="todo" className="sr-only">
          Add a to-do
        </label>
        <input
          id="todo"
          value={draft}
          maxLength={160}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a to-do"
          className="min-h-12 min-w-0 rounded-2xl border border-line bg-card px-4 text-[16px] outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-accent"
        />
        <label htmlFor="todo-due" className="sr-only">
          Due date (optional)
        </label>
        <input
          id="todo-due"
          type="date"
          value={due}
          min={today}
          onChange={(e) => setDue(e.target.value)}
          className="min-h-12 w-[9rem] rounded-2xl border border-line bg-card px-2 text-[16px] text-ink-soft"
        />
        <button
          type="submit"
          className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink active:scale-95"
          aria-label="Add to-do"
        >
          <Plus size={20} weight="bold" />
        </button>
      </form>
    </section>
  );
}

/** The ✕ on an added to-do: a second tap deletes it. */
function RemoveTodo({ label, onRemove }: { label: string; onRemove: () => void }) {
  const [armed, arm] = useArmed();
  return (
    <button
      onClick={() => (armed ? onRemove() : arm())}
      className={`grid shrink-0 place-items-center text-sm font-semibold ${
        armed ? 'min-h-10 rounded-full bg-warn px-3 text-warn-ink' : 'size-12 text-ink-faint'
      }`}
      aria-label={armed ? `Tap again to delete ${label}` : `Remove ${label}`}
    >
      {armed ? 'Delete?' : <X size={16} />}
    </button>
  );
}
