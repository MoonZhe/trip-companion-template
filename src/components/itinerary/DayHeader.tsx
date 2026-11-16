'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bed, Confetti } from '@phosphor-icons/react';
import type { Day, Hotel } from '@/lib/sheet/types';
import { useTripData } from '@/components/providers/TripData';
import { isSkipped } from '@/lib/trip/skip';
import { CityPattern } from '@/components/ui/CityPattern';
import { cityOf, hotelMapsUrl } from '@/lib/trip/city';
import { shortDate } from '@/lib/format';

/** How many of the day's planned stops are ticked ("choose one" rows aren't counted). */
export function useDayProgress(day: Day): { done: number; total: number; complete: boolean } {
  const { checks } = useTripData();
  // Skipped stops don't count towards the day.
  const plain = day.stops.filter((s) => !s.isOption && !isSkipped(checks, s));
  const done = plain.filter((s) => checks.has(s.key)).length;
  return { done, total: plain.length, complete: plain.length > 0 && done === plain.length };
}

/**
 * The day's title, kept short (Today and Days) so the plan sits high on the screen. No hotel pill:
 * the day ends with the way back to it. `aside` (the weather) sits beside the date.
 */
export function DayHeader({ day, total, aside }: { day: Day; total: number; aside?: React.ReactNode }) {
  const city = cityOf(day.city);
  const { complete } = useDayProgress(day);
  const title = (s: string) => (/DEPART/i.test(s) ? 'flight home' : s.charAt(0) + s.slice(1).toLowerCase());
  const travel = day.city.includes('→')
    ? day.city
        .split('→')
        .map((p) => title(p.trim()))
        .join(' to ')
    : /DAY TRIP/i.test(day.city)
      ? 'Day trip'
      : null;
  return (
    <header className="relative -mx-4 md:-mx-8 grid gap-2 px-4 md:px-8 pt-2 pb-3">
      <CityPattern city={city.key} className="-top-24 text-accent opacity-[0.10] dark:opacity-[0.16]" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-faint">
          Day {day.day} of {total} · {shortDate(day.isoDate)}
        </p>
        {aside}
      </div>
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[32px] leading-none font-semibold tracking-tight text-accent-text">{city.name}</h1>
        <DayCompleteBadge day={day.day} complete={complete} />
      </div>
      {travel && <p className="relative text-[15px] text-ink-soft">{travel}</p>}
    </header>
  );
}

const BURST = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];

/** "Day complete" pill. Bursts into confetti when the last stop gets ticked (not on page load). */
function DayCompleteBadge({ day, complete }: { day: number; complete: boolean }) {
  const reduce = useReducedMotion();
  const was = useRef<{ day: number; complete: boolean } | null>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (was.current && was.current.day === day && !was.current.complete && complete) setBurst((b) => b + 1);
    was.current = { day, complete };
  }, [day, complete]);

  return (
    <AnimatePresence>
      {complete && (
        <motion.span
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          className="relative inline-flex min-h-8 items-center gap-1.5 rounded-full bg-good px-3 text-sm font-semibold text-good-ink"
        >
          <Confetti size={16} weight="fill" />
          Day complete
          {!reduce &&
            burst > 0 &&
            Array.from({ length: 14 }, (_, i) => {
              const angle = (i / 14) * Math.PI * 2;
              return (
                <motion.i
                  key={`${burst}-${i}`}
                  aria-hidden
                  className="absolute top-1/2 left-1/2 size-1.5 rounded-full"
                  style={{ background: BURST[i % BURST.length] }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(angle) * 70, y: Math.sin(angle) * 44 + 12, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Tonight's hotel. Tap to open it in Google Maps. */
export function HotelPill({ hotel }: { hotel: Hotel }) {
  return (
    <a
      href={hotelMapsUrl(hotel)}
      target="_blank"
      rel="noreferrer"
      className="relative mt-1 flex min-h-12 items-center gap-3 self-start rounded-2xl border border-line bg-card px-4 py-2 active:scale-[0.99]"
    >
      <Bed size={20} className="shrink-0 text-accent-text" />
      <span className="grid text-left">
        <span className="text-[15px] leading-tight font-medium">{hotel.name}</span>
        <span className="text-xs text-ink-faint">{hotel.area}</span>
      </span>
    </a>
  );
}
