'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { DayPage } from '@/components/itinerary/DaySwipe';
import { useTripData } from '@/components/providers/TripData';
import { useShell } from '@/components/shell/AppShell';
import { DayHeader, useDayProgress } from '@/components/itinerary/DayHeader';
import { Timeline } from '@/components/itinerary/Timeline';
import { AddStop } from '@/components/itinerary/AddStop';
import { DayPhotos } from '@/components/itinerary/DayPhotos';
import { DayForecast, WeatherSummary } from '@/components/itinerary/DayForecast';
import { DayMap } from '@/components/map/DayMap';
import { ViewPill, useView } from '@/components/map/ViewToggle';
import { TranslateShortcuts } from '@/components/trip/TranslateShortcuts';
import { TripNotice, TripSkeleton } from '@/components/ui/States';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { cityOf, hotelFor } from '@/lib/trip/city';
import { tripClock, tripDayIndex } from '@/lib/time/now';
import { useWeather, type DayWeather } from '@/lib/trip/weather';
import { useNow } from '@/lib/time/useNow';
import { shortDate } from '@/lib/format';
import { useDragScroll } from '@/lib/ui/dragScroll';
import { GOTO_STOP, type GotoStop } from '@/components/search/Search';
import type { Day } from '@/lib/sheet/types';

/** A stop opened from search on another tab (`?s=`), focused once the page is up. */
function stopFromUrl(): { key: string; n: number } | null {
  const key = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('s');
  return key ? { key, n: 1 } : null;
}

function defaultDay(count: number, today: number | 'before' | 'after'): number {
  const fromUrl = typeof window === 'undefined' ? 0 : Number(new URLSearchParams(window.location.search).get('d'));
  if (fromUrl >= 1 && fromUrl <= count) return fromUrl - 1;
  return typeof today === 'number' ? today : today === 'after' ? count - 1 : 0;
}

export default function DaysPage() {
  const { trip } = useTripData();
  const [picked, setSelected] = useState<number | null>(null);
  const [dir, setDir] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const [view, setView] = useView();
  const reduce = useReducedMotion();
  const weather = useWeather();
  const now = useNow();
  const selected = picked ?? (trip ? defaultDay(trip.days.length, tripDayIndex(trip.days)) : null);
  const { setPageAccent } = useShell();
  const dayAccent = trip && selected !== null ? cityOf(trip.days[selected].city).accent : null;

  // + Expense and the tab bar take the colour of the day on screen; back to today's on leaving.
  useEffect(() => {
    setPageAccent(dayAccent);
    return () => setPageAccent(null);
  }, [dayAccent, setPageAccent]);

  // Centre the day's chip by scrolling the strip sideways only: scrollIntoView would also scroll the
  // page up to the strip, jumping away from the plan on every swipe.
  useEffect(() => {
    const s = strip.current;
    const chip = s?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!s || !chip) return;
    const offset = chip.getBoundingClientRect().left - s.getBoundingClientRect().left;
    s.scrollTo({ left: s.scrollLeft + offset - (s.clientWidth - chip.offsetWidth) / 2 });
  }, [selected]);
  useDragScroll(strip, selected !== null);

  // A stop picked in search: show its day as a list, and open it there.
  const [focus, setFocus] = useState(stopFromUrl);
  const focusStop = useEffectEvent((key: string) => {
    if (!trip || selected === null) return;
    const i = trip.days.findIndex((d) => d.stops.some((s) => s.key === key));
    if (i < 0) return;
    if (i !== selected) {
      setDir(i > selected ? 1 : -1);
      setSelected(i);
    }
    window.history.replaceState(null, '', `/days?d=${trip.days[i].day}`);
    if (view === 'map') setView('list');
    setFocus((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  });
  useEffect(() => {
    const on = (e: Event) => focusStop((e as CustomEvent<GotoStop>).detail.key);
    window.addEventListener(GOTO_STOP, on);
    return () => window.removeEventListener(GOTO_STOP, on);
  }, []);
  // On arrival from another tab: drop ?s= so a reload doesn't jump again, and show the list.
  const arrived = useEffectEvent(() => {
    const p = new URLSearchParams(window.location.search);
    p.delete('s');
    window.history.replaceState(null, '', `/days${p.size ? `?${p}` : ''}`);
    if (view === 'map') setView('list');
  });
  useEffect(() => {
    if (trip && focus?.n === 1) arrived();
  }, [trip, focus]);
  // "Choose one" stops sit in the option picker, not a row of their own: scroll to that instead.
  useEffect(() => {
    if (!focus || !trip) return;
    const isOption = trip.days.some((d) => d.stops.some((s) => s.key === focus.key && s.isOption));
    if (!isOption) return;
    const t = setTimeout(() => document.querySelector('[data-options]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => clearTimeout(t);
  }, [focus, trip]);

  if (!trip || selected === null)
    return (
      <>
        <TripNotice />
        <TripSkeleton />
      </>
    );

  const go = (i: number) => {
    if (i < 0 || i >= trip.days.length || i === selected) return;
    setDir(i > selected ? 1 : -1);
    setSelected(i);
    window.history.replaceState(null, '', `/days?d=${trip.days[i].day}`);
  };

  const day = trip.days[selected];
  const accent = cityOf(day.city).accent;
  const hotel = hotelFor(trip.days, selected, trip.hotels);
  const today = tripClock(now).isoDate;
  const motionDir = { dir, reduce: !!reduce };

  return (
    <div style={{ '--accent': accent } as React.CSSProperties}>
      <TripNotice />
      <div
        ref={strip}
        className="no-scrollbar -mx-4 md:-mx-8 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 md:px-8 pt-1 pb-2 select-none"
        role="tablist"
        aria-label="Trip days"
      >
        {trip.days.map((d, i) => (
          <DayChip
            key={d.day}
            day={d}
            on={i === selected}
            weather={weather(cityOf(d.city).key, d.isoDate)}
            onClick={() => go(i)}
          />
        ))}
      </div>

      {/* Drag the day (not the map) left or right to move between days. */}
      <div className="mt-4 overflow-x-clip">
        <AnimatePresence mode="popLayout" initial={false} custom={motionDir}>
          <DayPage
            key={day.day}
            custom={motionDir}
            prev={trip.days[selected - 1]}
            next={trip.days[selected + 1]}
            draggable={view !== 'map'}
            onSwipe={(step) => go(selected + step)}
          >
            {/* The same compact header as Today. */}
            <DayHeader day={day} total={trip.days.length} aside={<WeatherSummary day={day} />} />
            <TranslateShortcuts end={<ViewPill view={view} onChange={setView} />} />
            <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-10">
              <div>
                {view === 'map' ? (
                  <DayMap key={day.day} day={day} hotel={hotel} />
                ) : (
                  <>
                    <Timeline day={day} hotel={hotel} focusKey={focus} />
                    <AddStop day={day} />
                  </>
                )}
              </div>
              {/* The day's weather in detail, below the plan (beside it on wide screens). */}
              <div className="lg:sticky lg:top-6 lg:[&>:first-child]:mt-0">
                <div className="mt-6">
                  <DayForecast day={day} />
                </div>
                {day.isoDate <= today && <DayPhotos day={day} />}
              </div>
            </div>
          </DayPage>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A day in the strip: number inside a progress ring, date, and the forecast when there is one. */
function DayChip({ day, on, weather, onClick }: { day: Day; on: boolean; weather?: DayWeather; onClick: () => void }) {
  const { done, total, complete } = useDayProgress(day);
  const c = cityOf(day.city);
  const R = 15;
  const C = 2 * Math.PI * R;
  const pct = total ? done / total : 0;
  const [, dd, mon] = shortDate(day.isoDate).split(' ');

  return (
    <button
      role="tab"
      aria-selected={on}
      aria-current={on}
      aria-label={`Day ${day.day}, ${shortDate(day.isoDate)}, ${c.name}. ${done} of ${total} done`}
      onClick={onClick}
      style={{ '--accent': c.accent } as React.CSSProperties}
      className={`flex min-h-[5.5rem] min-w-[4.75rem] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-2xl border px-2 transition active:scale-[0.97] ${
        on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card'
      } ${complete && !on ? 'opacity-70' : ''}`}
    >
      <span className="relative grid size-9 place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r={R} fill="none" strokeWidth="2.5" className={on ? 'stroke-white/25' : 'stroke-line'} />
          {pct > 0 && (
            <circle
              cx="18"
              cy="18"
              r={R}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${pct * C} ${C}`}
              className={on ? 'stroke-white' : complete ? 'stroke-good' : 'stroke-accent'}
            />
          )}
        </svg>
        <span className="tabular text-base leading-none font-semibold">{day.day}</span>
      </span>
      <span className={`text-xs leading-none ${on ? 'opacity-85' : 'text-ink-faint'}`}>
        {dd} {mon}
      </span>
      {weather && (
        <span className={`tabular flex items-center gap-0.5 text-xs leading-none ${on ? 'opacity-90' : 'text-ink-soft'}`}>
          <WeatherIcon w={weather} size={13} label={`${weather.max}° high, rain up to ${weather.rain}%`} />
          {weather.max}°
        </span>
      )}
    </button>
  );
}
