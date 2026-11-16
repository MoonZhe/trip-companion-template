'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowCounterClockwise,
  CaretRight,
  Check,
  NavigationArrow,
  SkipForward,
  Ticket,
  TrainSimple,
  Trash,
  Wallet,
} from '@phosphor-icons/react';
import type { Day, Hotel, Stop } from '@/lib/sheet/types';
import { FileChips } from '@/components/files/Files';
import type { Station } from '@/lib/maps/stations';
import { haptic } from '@/lib/ui/haptic';
import { cityForStop, directionsUrl, hotelDirectionsUrl, placeName } from '@/lib/trip/city';
import { nextStopOf } from '@/lib/trip/travel';
import { useTripData } from '@/components/providers/TripData';
import { useShell } from '@/components/shell/AppShell';
import { isAddedStop, isSkipped, skipKey } from '@/lib/trip/skip';
import { useArmed } from '@/lib/ui/useArmed';
import { categoryFromStop } from '@/components/money/categories';
import { jpy } from '@/lib/format';
import { BOOK_LABEL, bookAheadLevel } from '@/lib/trip/bookAhead';
import { parseTips, pinOf } from '@/lib/trip/tips';
import { StopWeather } from './StopWeather';
import { HoursBadge, HoursLine } from './StopHours';
import type { HoursCheck } from '@/lib/trip/hours';

type HoursInfo = { check: HoursCheck | null; today: string | null };

// Stops at a space or Japanese punctuation, which never belongs to a URL in the sheet.
const URL_RE = /(https?:\/\/[^\s<>「」『』（）。、，]+)/g;

/** A URL ending a sentence or a bracket ("… https://x.jp/a)."): the link, and the punctuation to show after it. */
function trimUrl(url: string): [string, string] {
  let end = url.length;
  while (end > 0) {
    const c = url[end - 1];
    const head = url.slice(0, end);
    // Keep a ")" that closes a "(" inside the URL (Wikipedia-style links).
    const unmatched = c === ')' && (head.match(/\(/g)?.length ?? 0) < (head.match(/\)/g)?.length ?? 0);
    if (!/[.,;:!?\]]/.test(c) && !unmatched) break;
    end--;
  }
  return [url.slice(0, end), url.slice(end)];
}

/** Sheet text with any URLs turned into short tappable links (a raw URL is one unbreakable word and widens the card past the screen). */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) => {
        if (i % 2 === 0) return part;
        const [href, after] = trimUrl(part);
        let label = href;
        try {
          label = new URL(href).hostname.replace(/^www\./, '');
        } catch {}
        return (
          <Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-text underline decoration-1 underline-offset-2"
            >
              {label} ↗
            </a>
            {after}
          </Fragment>
        );
      })}
    </>
  );
}

/** The sheet's tips cell: a summary line, then one icon-led point per line. */
function TipsList({ text }: { text: string }) {
  const { lead, points: all } = parseTips(text);
  // The 📍 line is the stop's exact place for directions and the map, not a tip to read.
  const points = all.filter((p) => p.icon !== '📍');
  return (
    <div className="grid min-w-0 max-w-[65ch] gap-2 [overflow-wrap:anywhere]">
      {lead && (
        <p className="text-[15px] leading-relaxed text-ink">
          <Linkified text={lead} />
        </p>
      )}
      {points.length > 0 && (
        <ul className="grid gap-1.5">
          {points.map((p, i) => (
            <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1.5 text-[15px] leading-snug text-ink-soft">
              <span aria-hidden className="text-center">
                {p.icon ?? '•'}
              </span>
              <span>
                <Linkified text={p.text} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SMALL =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-medium active:scale-[0.98]';

export type NextLink = { name: string; href: string };

/** Directions for the stop's "Then" leg: to the next stop, or to the hotel after the day's last one. */
export function nextLinkFor(day: Day, stop: Stop, hotel?: Hotel | null): NextLink | undefined {
  const next = nextStopOf(day, stop);
  if (next === 'hotel') {
    if (!hotel || /check-?in/i.test(stop.title)) return undefined;
    return { name: hotel.name, href: hotelDirectionsUrl(hotel) };
  }
  if (!next) return undefined;
  // Name it after the 📍 place when the sheet has one (its first part: "3COINS Namba CITY").
  const pin = pinOf(next.tips);
  const name = pin && !pin.url ? pin.text.split(',')[0].trim() : placeName(next);
  return { name, href: directionsUrl(next, cityForStop(day, next)) };
}

/** The stop's saved tickets. */
export function useStopTickets(stopKey: string) {
  const { files } = useTripData();
  return files.filter((f) => f.kind === 'ticket' && f.stop_key === stopKey);
}

/** Small pill flagging that a stop needs (or could use) arranging before the trip. Turns into "Booked" once a ticket is saved. */
export function BookBadge({ note, onAccent = false, booked = false }: { note: string; onAccent?: boolean; booked?: boolean }) {
  const level = bookAheadLevel(note);
  if (booked)
    return (
      <span
        className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          onAccent ? 'bg-white/15 text-accent-ink' : 'bg-good/15 text-good'
        }`}
      >
        <Check size={13} weight="bold" />
        Booked · ticket saved
      </span>
    );
  if (!level) return null;
  const tone = onAccent
    ? 'bg-white/15 text-accent-ink'
    : level === 'book'
      ? 'bg-accent-soft text-accent-text'
      : 'border border-line text-ink-soft';
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      <Ticket size={13} weight="fill" />
      {BOOK_LABEL[level]}
    </span>
  );
}

/** The round tick on a stop: springs and gives a haptic tap when ticked. */
export function TickButton({ stopKey, title }: { stopKey: string; title: string }) {
  const { checks, toggleCheck } = useTripData();
  const reduce = useReducedMotion();
  const done = checks.has(stopKey);
  return (
    <button
      onClick={() => {
        if (!done) haptic();
        toggleCheck(stopKey);
      }}
      aria-pressed={done}
      aria-label={done ? `Mark ${title} not done` : `Mark ${title} done`}
      className="grid size-14 shrink-0 place-items-center"
    >
      <motion.span
        animate={done && !reduce ? { scale: [1, 1.3, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={`grid size-8 place-items-center rounded-full border-2 transition-colors ${
          done ? 'border-good bg-good text-good-ink' : 'border-line text-transparent'
        }`}
      >
        <motion.span
          initial={false}
          animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          className="grid"
        >
          <Check size={16} weight="bold" />
        </motion.span>
      </motion.span>
    </button>
  );
}

/** One itinerary stop in a timeline. Tap to expand the full tips and actions. */
export function StopRow({
  stop,
  dayCity,
  highlight = false,
  station,
  isoDate,
  hours,
  next,
  travelShown = false,
  stationShown = false,
  focus,
}: {
  stop: Stop;
  dayCity: string;
  highlight?: boolean;
  /** Set (and bumped) when search jumps here: open the details and scroll the stop into view. */
  focus?: number;
  station?: Station;
  /** The day's date, for the stop's forecast. */
  isoDate?: string;
  /** The place's opening hours checked against the planned time. */
  hours?: HoursInfo;
  /** Where the "Then" leg goes. */
  next?: NextLink;
  /** The timeline already shows this stop's travel just below it, so the details needn't repeat it. */
  travelShown?: boolean;
  /** The leg just above already names this stop's nearest station. */
  stationShown?: boolean;
}) {
  const { checks } = useTripData();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const done = checks.has(stop.key);
  const skipped = isSkipped(checks, stop);
  const tickets = useStopTickets(stop.key);
  const row = useRef<HTMLLIElement>(null);

  // Picked in search (again): open the details.
  const [focused, setFocused] = useState<number | undefined>(undefined);
  if (focus !== focused) {
    setFocused(focus);
    if (focus !== undefined) setOpen(true);
  }
  useEffect(() => {
    if (focus === undefined) return;
    // Once the day page has slid in and the details have opened; then once more, without animation,
    // in case the page was still moving underneath the first scroll.
    const toRow = (smooth: boolean) => {
      const li = row.current;
      const scroller = document.getElementById('app-scroll');
      if (!li || !scroller) return;
      const off = li.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
      if (Math.abs(off) > 4) scroller.scrollBy({ top: off, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    };
    const t1 = setTimeout(() => toRow(true), 450);
    const t2 = setTimeout(() => toRow(false), 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focus, reduce]);

  return (
    <li
      ref={row}
      className={`relative scroll-mt-4 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 transition-opacity ${done || skipped ? 'opacity-55' : ''}`}
    >
      <div className="tabular pt-3.5 text-right font-mono text-sm text-ink-soft">{stop.time}</div>
      <div className={`rounded-2xl ${highlight ? 'bg-accent-soft' : ''}`}>
        <div className="flex items-start gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-h-14 flex-1 items-start gap-2 py-3 pl-3 text-left"
          >
            <span className="flex-1">
              <span
                className={`block text-[16px] leading-snug font-semibold ${done || skipped ? 'line-through decoration-1' : ''}`}
              >
                {stop.title}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-faint">
                {skipped && <span className="font-semibold text-ink-soft">Skipped</span>}
                {[stop.duration, stop.costJpy ? jpy(stop.costJpy) : null].filter(Boolean).join('  ·  ')}
                {isoDate && !done && !skipped && <StopWeather stop={stop} dayCity={dayCity} isoDate={isoDate} />}
              </span>
              {(bookAheadLevel(stop.bookAhead) || tickets.length > 0) && (
                <span className="mt-1.5 block">
                  <BookBadge note={stop.bookAhead} booked={tickets.length > 0} />
                </span>
              )}
              {!done && !skipped && hours?.check && hours.check.kind !== 'ok' && (
                <span className="mt-1.5 block">
                  <HoursBadge info={hours} />
                </span>
              )}
            </span>
            <CaretRight size={18} className={`mt-1 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
          {skipped ? <span aria-hidden className="size-14 shrink-0" /> : <TickButton stopKey={stop.key} title={stop.title} />}
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <StopDetails
                stop={stop}
                dayCity={dayCity}
                station={station}
                hours={hours}
                next={next}
                isoDate={isoDate}
                travelShown={travelShown}
                stationShown={stationShown}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

export function StopDetails({
  stop,
  dayCity,
  station,
  hours,
  next: nextProp,
  isoDate,
  travelShown = false,
  stationShown = false,
  inCard = false,
}: {
  stop: Stop;
  dayCity: string;
  station?: Station;
  hours?: HoursInfo;
  next?: NextLink;
  /** The stop's day, so "Log spend" files the expense under it. */
  isoDate?: string;
  travelShown?: boolean;
  stationShown?: boolean;
  /** Inside the Now/Next cards, which carry their own directions: just the tips, station and Log spend. */
  inCard?: boolean;
}) {
  const travel = !inCard && !travelShown && stop.travelNext && stop.travelNext !== '—' ? stop.travelNext : '';
  const next = inCard ? undefined : nextProp;
  const showStation = !!station && !stationShown;
  const { openQuickAdd } = useShell();
  const tickets = useStopTickets(stop.key);
  return (
    <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 [overflow-wrap:anywhere] ${inCard ? '' : 'px-3 pb-4'}`}>
      {/* Getting here comes first, with the nearest station; getting on to the next stop sits with "Then". */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 empty:hidden">
        {!inCard && (
          <a href={directionsUrl(stop, dayCity)} target="_blank" rel="noreferrer" className={`${SMALL} w-fit`}>
            <NavigationArrow size={16} weight="fill" className="shrink-0" />
            Get here
          </a>
        )}
        {showStation && station && (
          <p className="flex min-w-0 flex-1 basis-48 items-center gap-2 text-sm text-ink-soft">
            <TrainSimple size={16} weight="fill" className="shrink-0 text-accent-text" />
            <span>
              Nearest station: <span className="font-semibold text-ink">{station.name}</span> · {station.walkMin} min walk
            </span>
          </p>
        )}
      </div>
      {stop.tips && <TipsList text={stop.tips} />}
      <HoursLine info={hours} />
      {stop.bookAhead && (
        <p className="flex max-w-[65ch] gap-2 rounded-xl bg-sunk p-3 text-sm leading-relaxed text-ink-soft">
          <Ticket size={16} weight="fill" className="mt-0.5 shrink-0 text-accent-text" />
          <span className="min-w-0">
            <Linkified text={stop.bookAhead} />
          </span>
        </p>
      )}
      <FileChips files={tickets} />
      {(travel || next) && (
        <p className="-mb-1.5 text-sm text-ink-faint">
          <span className="font-medium text-ink-soft">
            Then{next ? <> to {next.name}</> : null}
            {travel ? ': ' : ''}
          </span>
          {travel ? <Linkified text={travel} /> : null}
        </p>
      )}
      {/* Leaving: on to the next stop, and log what this one cost. */}
      <div className="flex min-w-0 items-center gap-2">
        {next && (
          <a
            href={next.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Directions to ${next.name}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink active:scale-[0.98]"
          >
            <NavigationArrow size={16} weight="fill" className="shrink-0" />
            Directions
          </a>
        )}
        <button
          onClick={() =>
            openQuickAdd({
              category: categoryFromStop(stop.category),
              note: stop.title.replace(/^\[Option [A-Z]\]\s*/, ''),
              day: isoDate,
            })
          }
          className={`${SMALL} shrink-0`}
        >
          <Wallet size={16} />
          Log spend
        </button>
      </div>
      <StopManage stop={stop} />
    </div>
  );
}

/**
 * Quiet text buttons under a stop's details: Skip (any stop; undoable, offline, never touches
 * the sheet) and, for stops added from the app, Delete (removes the row; asks twice).
 */
function StopManage({ stop }: { stop: Stop }) {
  const { checks, toggleCheck, deleteStop } = useTripData();
  const { toast } = useShell();
  const [armed, arm] = useArmed();
  const [busy, setBusy] = useState(false);
  const skipped = isSkipped(checks, stop);
  const added = isAddedStop(stop);
  const skip = () => {
    toggleCheck(skipKey(stop.key));
    if (!skipped) toast(`Skipped ${stop.title}`, () => toggleCheck(skipKey(stop.key)));
  };
  const remove = async () => {
    if (!armed) return arm();
    setBusy(true);
    const err = await deleteStop({ day: stop.day, time: stop.time, title: stop.title });
    setBusy(false);
    toast(err ?? `Removed ${stop.title} from the sheet`);
  };
  return (
    <div className="-mb-2 flex flex-wrap items-center gap-x-4 border-t border-line pt-1">
      <button
        type="button"
        onClick={skip}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft"
      >
        {skipped ? <ArrowCounterClockwise size={16} /> : <SkipForward size={16} />}
        {skipped ? 'Bring it back' : 'Skip this stop'}
      </button>
      {added && (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className={`-ml-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium disabled:opacity-60 ${
            armed ? 'bg-warn font-semibold text-warn-ink' : 'text-ink-soft'
          }`}
          aria-label={armed ? `Tap again to delete ${stop.title} from the sheet` : `Delete ${stop.title}`}
        >
          <Trash size={16} />
          {busy ? 'Deleting' : armed ? 'Delete?' : 'Delete'}
        </button>
      )}
    </div>
  );
}
