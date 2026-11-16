'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CaretDown, Check, Clock, NavigationArrow } from '@phosphor-icons/react';
import type { Day, Stop } from '@/lib/sheet/types';
import { cityForStop, cityOf, directionsUrl } from '@/lib/trip/city';
import { useTripData } from '@/components/providers/TripData';
import { useShell } from '@/components/shell/AppShell';
import { BookBadge, Linkified, StopDetails, useStopTickets } from '@/components/itinerary/StopRow';
import { FileChips } from '@/components/files/Files';
import { CityPattern } from '@/components/ui/CityPattern';
import { useStations } from '@/lib/maps/stations';
import { useHours } from '@/lib/maps/hours';
import { parseTips } from '@/lib/trip/tips';
import { leaveBy, leaveLabel, leaveTone, type LeaveBy } from '@/lib/trip/travel';
import { tripClock } from '@/lib/time/now';
import { useNow } from '@/lib/time/useNow';
import { haptic } from '@/lib/ui/haptic';

/**
 * The stop that matters now, big, and the one after it. While at a stop, the big Directions button
 * moves to the next one (that's where you're going); before a stop starts, or once the current one
 * is ticked (`from` is the stop being left), Directions takes you to the big card's stop.
 * Either card opens to the stop's full tips.
 */
export function NowNext({ day, now, next, from = null }: { day: Day; now: Stop | null; next: Stop | null; from?: Stop | null }) {
  const { checks, toggleCheck } = useTripData();
  const { toast } = useShell();
  // Undo runs after the tick has re-rendered this card, so it reads the checks as they are then.
  const latest = useRef({ checks, toggleCheck });
  useEffect(() => {
    latest.current = { checks, toggleCheck };
  });
  const reduce = useReducedMotion();
  const clock = useNow();
  const [open, setOpen] = useState<string | null>(null);
  const main = now ?? next;
  const tickets = useStopTickets(main?.key ?? '');
  const nextTickets = useStopTickets(next?.key ?? '');
  if (!main) return null;
  const done = checks.has(main.key);
  const hhmm = tripClock(clock).hhmm;
  // A "pick one" set still unpicked between two stops: the way on depends on the pick, so no
  // leave-by or next-stop Directions (the picker gives each option its own).
  const choosing = (a: Stop | null, b: Stop | null) =>
    !!a && !!b && day.stops.slice(day.stops.indexOf(a) + 1, day.stops.indexOf(b)).some((s) => s.isOption);
  const pickFirst = choosing(now, next);
  // The leave-by goes with the stop we're heading to.
  const leave = now && next && !pickFirst ? leaveBy(now, next, hhmm) : null;
  const leaveForMain = !now && from && !choosing(from, main) ? leaveBy(from, main, hhmm) : null;
  const atStop = !!now && !!next;
  const label = now ? `Now, since ${main.time}` : from ? `Up next at ${main.time}` : `First up at ${main.time}`;
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  return (
    <section className="grid gap-3">
      <motion.article
        key={main.key}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-[28px] bg-accent text-accent-ink shadow-soft"
      >
        <CityPattern city={cityOf(day.city).key} fade="right" className="text-white opacity-[0.13]" />
        <div className="relative grid gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium opacity-80">{label}</p>
            {leaveForMain && <LeaveChip leave={leaveForMain} />}
          </div>
          <h2 className="text-[28px] leading-[1.1] font-semibold tracking-tight">{main.title}</h2>
          {main.tips && open !== main.key && (
            <p className="line-clamp-3 text-[15px] leading-relaxed opacity-90">{parseTips(main.tips).lead}</p>
          )}
          {from?.travelNext && from.travelNext !== '—' && (
            <p className="text-sm opacity-90 [overflow-wrap:anywhere]">
              Getting there: <Linkified text={from.travelNext} />
            </p>
          )}
          <BookBadge note={main.bookAhead} onAccent booked={tickets.length > 0} />
          {tickets.length > 0 && <FileChips files={tickets} big />}
          <DetailsToggle open={open === main.key} onClick={() => toggle(main.key)} onAccent />
          <Details open={open === main.key} day={day} stop={main} onAccent />
          <div className="mt-1 flex gap-2">
            {!atStop && (
              <a
                href={directionsUrl(main, cityForStop(day, main))}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-card text-base font-semibold text-ink active:scale-[0.98]"
              >
                <NavigationArrow size={20} weight="fill" />
                Directions
              </a>
            )}
            <button
              onClick={() => {
                toggleCheck(main.key);
                if (done) return;
                haptic();
                // Ticking moves the stop out of sight into "Earlier today", so offer a way back.
                const key = main.key;
                toast(`Done: ${main.title}`, () => {
                  if (latest.current.checks.has(key)) latest.current.toggleCheck(key);
                });
              }}
              aria-pressed={done}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold transition-colors active:scale-[0.98] ${
                atStop ? 'flex-1' : ''
              } ${done ? 'bg-good text-good-ink' : atStop ? 'bg-card text-ink' : 'bg-white/15 text-accent-ink'}`}
            >
              <motion.span
                animate={done && !reduce ? { scale: [1, 1.35, 1], rotate: [0, -10, 0] } : { scale: 1 }}
                transition={{ duration: 0.4 }}
                className="grid"
              >
                <Check size={20} weight="bold" />
              </motion.span>
              {done ? 'Done' : 'Mark done'}
            </button>
            {atStop && (
              // Still on the way here (running late): a small way in.
              <a
                href={directionsUrl(main, cityForStop(day, main))}
                target="_blank"
                rel="noreferrer"
                aria-label={`Directions to ${main.title}`}
                className="grid size-14 shrink-0 place-items-center rounded-full bg-white/15 active:scale-[0.98]"
              >
                <NavigationArrow size={20} weight="fill" />
              </a>
            )}
          </div>
        </div>
      </motion.article>

      {atStop && next && (
        <article className="grid gap-3 rounded-[24px] border border-line bg-card p-5">
          <div>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-ink-faint">Next at {next.time}</p>
              {leave && <LeaveChip leave={leave} />}
            </div>
            <h3 className="mt-1 text-xl leading-snug font-semibold tracking-tight">{next.title}</h3>
            {now.travelNext && now.travelNext !== '—' && (
              <p className="mt-2 text-[15px] text-ink-soft [overflow-wrap:anywhere]">
                Getting there: <Linkified text={now.travelNext} />
              </p>
            )}
            {leave && (
              <p className="tabular mt-1 text-sm text-ink-faint">
                Leave by {leave.at} to arrive on time ({leave.travelMin} min)
              </p>
            )}
          </div>
          {nextTickets.length > 0 && <FileChips files={nextTickets} />}
          <DetailsToggle open={open === next.key} onClick={() => toggle(next.key)} />
          <Details open={open === next.key} day={day} stop={next} />
          {!pickFirst && (
            <a
              href={directionsUrl(next, cityForStop(day, next))}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-accent-ink active:scale-[0.98]"
            >
              <NavigationArrow size={20} weight="fill" />
              Directions to the next stop
            </a>
          )}
        </article>
      )}
    </section>
  );
}

function DetailsToggle({ open, onClick, onAccent = false }: { open: boolean; onClick: () => void; onAccent?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`-my-1 flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold ${onAccent ? 'opacity-90' : 'text-accent-text'}`}
    >
      {open ? 'Hide tips' : 'Tips & details'}
      <CaretDown size={14} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

/** The stop's full tips, station, hours and Log spend, opened from a Now/Next card. */
function Details({ open, day, stop, onAccent = false }: { open: boolean; day: Day; stop: Stop; onAccent?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className={onAccent ? 'rounded-2xl bg-card p-4 text-ink' : ''}>
            <DetailsBody day={day} stop={stop} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Mounted only while open, so the station and hours lookups run only when wanted. */
function DetailsBody({ day, stop }: { day: Day; stop: Stop }) {
  const stations = useStations(day);
  const hours = useHours(day);
  return (
    <StopDetails
      stop={stop}
      dayCity={cityForStop(day, stop)}
      station={stations.get(stop.key)}
      hours={hours.get(stop.key)}
      isoDate={day.isoDate}
      inCard
    />
  );
}

const TONE: Record<ReturnType<typeof leaveTone>, string> = {
  relaxed: 'bg-sunk text-ink-soft',
  soon: 'bg-accent-soft text-accent-text',
  now: 'bg-caution text-caution-ink',
  late: 'bg-warn text-warn-ink',
};

/** "Leave in 12 min", turning amber at go-time and red once we're running late. */
function LeaveChip({ leave }: { leave: LeaveBy }) {
  const tone = leaveTone(leave.inMin);
  return (
    <span
      role="status"
      className={`tabular inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${TONE[tone]}`}
    >
      <Clock size={15} weight="bold" />
      {leaveLabel(leave)}
    </span>
  );
}
