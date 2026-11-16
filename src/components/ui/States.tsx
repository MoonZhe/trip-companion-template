'use client';
import { ArrowsClockwise, Info } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';

export function TripSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 pt-2" aria-label="Loading">
      <div className="h-4 w-32 rounded-full bg-sunk" />
      <div className="h-10 w-44 rounded-2xl bg-sunk" />
      <div className="h-56 rounded-[28px] bg-sunk" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3">
          <div className="h-4 rounded-full bg-sunk" />
          <div className="h-12 rounded-2xl bg-sunk" />
        </div>
      ))}
    </div>
  );
}

/** The browser's own words for "no connection" (Safari, Chrome, Firefox), which mean nothing to us. */
const NETWORK_ERROR = /load failed|failed to fetch|networkerror|network request failed/i;

/** Sheet warnings (e.g. serving the saved copy) and load errors, shown quietly. */
export function TripNotice() {
  const { trip, tripError, online, refresh, refreshing } = useTripData();
  const saved = trip?.warnings.find((w) => w.startsWith('Showing saved'));
  // With a saved trip, a failed update still matters (the plan on screen may be stale), but offline
  // the strip at the top already says so.
  const failed = !tripError
    ? null
    : trip
      ? online
        ? "Couldn't update the itinerary. Showing your saved copy."
        : null
      : NETWORK_ERROR.test(tripError)
        ? online
          ? "Couldn't reach the itinerary. Check your signal and try again."
          : "No signal. The itinerary will load when you're back online."
        : tripError;
  const message = failed ?? saved ?? null;
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-line bg-card p-4 text-sm text-ink-soft">
      <Info size={20} className="mt-0.5 shrink-0" />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={() => refresh(true)}
        disabled={refreshing}
        className="grid size-10 shrink-0 place-items-center rounded-full border border-line"
        aria-label="Try again"
      >
        <ArrowsClockwise size={18} className={refreshing ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
