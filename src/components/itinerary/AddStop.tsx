'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { useShell } from '@/components/shell/AppShell';
import { useTripData } from '@/components/providers/TripData';
import type { Day } from '@/lib/sheet/types';
import { tokyoClock } from '@/lib/time/now';
import { cityOf } from '@/lib/trip/city';

const CATEGORIES = [
  { value: '🍜 Food', label: 'Food' },
  { value: '🏛 Culture', label: 'Temple / culture' },
  { value: '🏙 Sightseeing', label: 'Sightseeing' },
  { value: '🛍 Shopping', label: 'Shopping' },
  { value: '🌿 Nature', label: 'Nature' },
  { value: '🚃 Transport', label: 'Transport' },
  { value: '🎉 Experience', label: 'Experience' },
];

/** "We found something not on the plan": adds a stop straight into the Google Sheet. */
export function AddStop({ day }: { day: Day }) {
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState(0);
  // Something's typed or it's saving: only the ✕ closes the sheet then.
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <>
      <button
        onClick={() => {
          setOpenId((n) => n + 1);
          setOpen(true);
        }}
        className="mt-3 ml-[4rem] flex min-h-12 items-center gap-2 rounded-full border border-dashed border-line px-5 text-[15px] font-medium text-ink-soft active:scale-[0.98]"
      >
        <Plus size={18} />
        Add a stop
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} dismissible={busy !== openId} title={`Add to Day ${day.day}`}>
        {open && <AddStopForm key={openId} day={day} onDone={() => setOpen(false)} onBusy={(b) => setBusy(b ? openId : null)} />}
      </Sheet>
    </>
  );
}

function AddStopForm({ day, onDone, onBusy }: { day: Day; onDone: () => void; onBusy: (busy: boolean) => void }) {
  const { addStop } = useTripData();
  const { toast } = useShell();
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(() => roundedNow());
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [notes, setNotes] = useState('');
  const [place, setPlace] = useState('');
  const city = cityOf(day.city).name;
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = saving || !!title.trim() || !!notes.trim() || !!place.trim() || !!cost;
  useEffect(() => onBusy(busy), [busy, onBusy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give it a short name');
      return;
    }
    setSaving(true);
    setError(null);
    const err = await addStop({
      day: day.day,
      time,
      title: title.trim(),
      notes: notes.trim(),
      // "Ichiran Shinsaibashi" → "Ichiran Shinsaibashi, Osaka"; a typed ", City" is kept as it is.
      place: place.trim() ? (place.includes(',') ? place.trim() : `${place.trim()}, ${city}`) : undefined,
      category,
      costJpy: cost ? Number(cost) : null,
    });
    // Closed with ✕ while it was saving: the form is gone, so say it failed in a toast instead.
    if (!mounted.current) {
      if (err) toast(`Stop not added: ${err}`);
      return;
    }
    setSaving(false);
    if (err) setError(err);
    else onDone();
  }

  const field = 'min-h-12 rounded-2xl border border-line bg-card px-4 text-[16px] outline-none focus:ring-2 focus:ring-accent';

  return (
    <form onSubmit={submit} className="grid gap-5 pb-2">
      <p className="text-sm text-ink-faint">It goes straight into the Google Sheet, in time order.</p>
      <div className="grid gap-2">
        <label htmlFor="stop-title" className="text-sm font-medium text-ink-soft">
          What is it?
        </label>
        <input
          id="stop-title"
          autoFocus
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={field}
          placeholder="Matcha cafe near the station"
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="stop-place" className="text-sm font-medium text-ink-soft">
          Place <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <input
          id="stop-place"
          maxLength={100}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          className={field}
          placeholder="Name as on Google Maps"
          aria-describedby="stop-place-help"
        />
        <p id="stop-place-help" className="text-xs leading-relaxed text-ink-faint">
          For the map pin and directions. {city} is added unless you type another city after a comma.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <label htmlFor="stop-time" className="text-sm font-medium text-ink-soft">
            Time
          </label>
          <input id="stop-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </div>
        <div className="grid gap-2">
          <label htmlFor="stop-cost" className="text-sm font-medium text-ink-soft">
            Cost ¥ <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input
            id="stop-cost"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))}
            className={`${field} tabular`}
          />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium text-ink-soft">Type</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => setCategory(c.value)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium active:scale-[0.97] ${
                category === c.value ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-soft'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <label htmlFor="stop-notes" className="text-sm font-medium text-ink-soft">
          Notes <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <textarea
          id="stop-notes"
          rows={2}
          maxLength={300}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${field} py-3`}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="min-h-14 rounded-full bg-accent text-base font-semibold text-accent-ink active:scale-[0.98] disabled:opacity-60"
      >
        {saving ? 'Adding to the sheet' : 'Add stop'}
      </button>
    </form>
  );
}

function roundedNow(): string {
  const [h, m] = tokyoClock().hhmm.split(':').map(Number);
  const mins = Math.min(23 * 60 + 45, Math.ceil((h * 60 + m) / 15) * 15);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
