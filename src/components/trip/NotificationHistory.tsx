'use client';
import { useEffect, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { readCached, writeCached } from '@/lib/offline/store';
import { groupByTripDay, type SentNotification } from '@/lib/push/history';
import type { Day } from '@/lib/sheet/types';

const CACHE_KEY = 'sent-notifications';

/** Every notification the phones were sent, by trip day, to look back on. Keeps a copy for offline. */
export function NotificationHistory() {
  const { trip } = useTripData();
  const [rows, setRows] = useState<SentNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    readCached<SentNotification[]>(CACHE_KEY)
      .then((saved) => {
        if (live && saved) setRows((now) => now ?? saved);
      })
      .catch(() => {});
    supabaseBrowser()
      .from('sent_notifications')
      .select('id, sent_at, title, body, rebuilt')
      .order('sent_at', { ascending: false })
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) return setFailed(true);
        setRows(data);
        writeCached(CACHE_KEY, data);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!rows) return failed ? <p className="px-1 text-sm text-ink-soft">Couldn&apos;t load these. Check your signal and try again.</p> : null;
  if (!rows.length) return <p className="px-1 text-sm text-ink-soft">Notifications will collect here as they&apos;re sent.</p>;
  return <SentList rows={rows} tripDays={trip?.days ?? []} />;
}

export function SentList({ rows, tripDays }: { rows: SentNotification[]; tripDays: Pick<Day, 'isoDate' | 'day' | 'dateLabel'>[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const days = groupByTripDay(rows);
  const shown = open ?? days[0].isoDate;

  return (
    <section className="grid gap-3 pb-4">
      <h2 className="text-xl font-semibold tracking-tight">Notifications</h2>
      {days.map(({ isoDate, items }) => {
        const day = tripDays.find((d) => d.isoDate === isoDate);
        const expanded = shown === isoDate;
        return (
          <div key={isoDate} className="overflow-hidden rounded-[24px] border border-line bg-card">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? '' : isoDate)}
              className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left"
            >
              <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
                <span className="truncate text-[16px] font-semibold">{day ? `Day ${day.day} · ${day.dateLabel}` : isoDate}</span>
                <span className="text-sm text-ink-faint">
                  {items.length} notification{items.length === 1 ? '' : 's'}
                </span>
              </span>
              <CaretDown size={18} className={`shrink-0 text-ink-faint transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
              <ol className="grid gap-4 border-t border-line px-5 py-4">
                {items.map((n) => (
                  <li key={n.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
                    <span className="tabular pt-0.5 text-sm text-ink-faint">{n.time}</span>
                    <div className="grid min-w-0 gap-0.5">
                      <p className="text-[15px] font-medium break-words">{n.title}</p>
                      <p className="text-sm leading-relaxed break-words whitespace-pre-line text-ink-soft">{n.body}</p>
                      {n.rebuilt && <p className="text-xs text-ink-faint">Rebuilt from the plan, wording may differ</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </section>
  );
}
