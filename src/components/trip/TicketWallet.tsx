'use client';
import { useState } from 'react';
import { FilePdf, Plus, Ticket } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { AttachButton, FileViewer } from '@/components/files/Files';
import type { TripFile } from '@/lib/files/store';
import { shortDate } from '@/lib/format';

const stopName = (title: string) => title.replace(/^\[Option [A-Z]\]\s*/, '');

/** Every saved ticket and booking in one place. New ones can be tagged to a stop, or kept for the whole trip. */
export function TicketWallet() {
  const { trip, files } = useTripData();
  const [open, setOpen] = useState<TripFile | null>(null);
  const [label, setLabel] = useState('');
  const [stopKey, setStopKey] = useState('');
  const tickets = files.filter((f) => f.kind === 'ticket');

  const stopDay = new Map(trip!.days.flatMap((d) => d.stops.map((s) => [s.key, d.day] as const)));
  const dayOf = (f: TripFile) => (f.stop_key ? stopDay.get(f.stop_key) : undefined);
  const sorted = [...tickets].sort((a, b) => (dayOf(a) ?? 0) - (dayOf(b) ?? 0));
  const stopTitle = trip!.days.flatMap((d) => d.stops).find((s) => s.key === stopKey)?.title;

  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Tickets and bookings</h2>
        <span className="text-sm text-ink-faint">Saved on this phone</span>
      </div>
      {sorted.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-card">
          {sorted.map((f) => {
            const day = dayOf(f);
            return (
              <li key={f.id}>
                <button
                  onClick={() => setOpen(f)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-sunk"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
                    {f.mime === 'application/pdf' ? <FilePdf size={20} /> : <Ticket size={20} weight="fill" />}
                  </span>
                  <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
                    <span className="truncate text-[15px] font-medium">{f.label || 'Ticket'}</span>
                    <span className="text-xs text-ink-faint">{day ? `Day ${day}` : 'Whole trip'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-[24px] border border-dashed border-line p-5 text-[15px] text-ink-soft">
          Nothing saved yet. Add tickets below and tag each to its stop, so it shows on that stop and ticks off the checklist.
        </p>
      )}
      <div className="grid gap-2 rounded-[24px] border border-line bg-card p-4">
        <p className="text-sm font-medium text-ink-soft">Add a ticket or booking</p>
        <label htmlFor="ticket-stop" className="sr-only">
          For which stop
        </label>
        <select
          id="ticket-stop"
          value={stopKey}
          onChange={(e) => setStopKey(e.target.value)}
          className="min-h-12 w-full min-w-0 rounded-2xl border border-line bg-card px-4 text-[16px]"
        >
          <option value="">Whole trip (boarding pass, eSIM…)</option>
          {trip!.days.map((d) => (
            <optgroup key={d.day} label={`Day ${d.day} · ${shortDate(d.isoDate)}`}>
              {d.stops.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.time ? `${s.time} ` : ''}
                  {stopName(s.title)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label htmlFor="ticket-label" className="sr-only">
          Name
        </label>
        <input
          id="ticket-label"
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={stopTitle ? stopName(stopTitle) : 'Name, e.g. Boarding pass KIX'}
          className="min-h-12 rounded-2xl border border-line bg-card px-4 text-[16px] outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-accent"
        />
        <AttachButton
          link={{
            kind: 'ticket',
            stop_key: stopKey || undefined,
            label: label.trim() || (stopTitle ? stopName(stopTitle) : undefined),
          }}
          onDone={() => {
            setLabel('');
            setStopKey('');
          }}
        >
          <Plus size={18} />
          Choose photo or PDF
        </AttachButton>
      </div>
      <FileViewer file={open} onClose={() => setOpen(null)} />
    </section>
  );
}
