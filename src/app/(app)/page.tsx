'use client';
import { TRIP } from '@/trip.config';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { DayHeader, HotelPill } from '@/components/itinerary/DayHeader';
import { NowNext } from '@/components/itinerary/NowNext';
import { Timeline } from '@/components/itinerary/Timeline';
import { AddStop } from '@/components/itinerary/AddStop';
import { DayPhotos } from '@/components/itinerary/DayPhotos';
import { DayForecast, WeatherSummary } from '@/components/itinerary/DayForecast';
import { TodaySpend } from '@/components/money/TodaySpend';
import { BriefPrompt } from '@/components/trip/BriefPrompt';
import { Checklist } from '@/components/trip/Checklist';
import { TranslateShortcuts } from '@/components/trip/TranslateShortcuts';
import { Recap } from '@/components/trip/Recap';
import { CityPattern } from '@/components/ui/CityPattern';
import { DayMap } from '@/components/map/DayMap';
import { ViewPill, useView } from '@/components/map/ViewToggle';
import { TripNotice, TripSkeleton } from '@/components/ui/States';
import { cityOf, hotelFor } from '@/lib/trip/city';
import { nowNext, tokyoClock, tripDayIndex } from '@/lib/time/now';
import { useNow } from '@/lib/time/useNow';

export default function TodayPage() {
  const { trip } = useTripData();
  const now = useNow();
  if (!trip)
    return (
      <>
        <TripNotice />
        <TripSkeleton />
      </>
    );

  const idx = tripDayIndex(trip.days, now);
  return (
    <>
      <TripNotice />
      <BriefPrompt />
      {idx === 'before' ? <BeforeTrip now={now} /> : idx === 'after' ? <AfterTrip /> : <DuringTrip index={idx} now={now} />}
    </>
  );
}

function DuringTrip({ index, now }: { index: number; now: Date }) {
  const { trip, checks } = useTripData();
  const [showEarlier, setShowEarlier] = useState(false);
  const [view, setView] = useView();
  const day = trip!.days[index];
  const hotel = hotelFor(trip!.days, index, trip!.hotels);
  const { now: current, next, from } = nowNext(day, now, checks);

  const pivot = current ?? next;
  const pivotIdx = pivot ? day.stops.indexOf(pivot) : day.stops.length;
  // A "pick one" set stays together under Later today until we're at, or leaving, a stop past it
  // (or the picked option), so the picker isn't folded away as "earlier" while it still matters.
  const firstOption = day.stops.findIndex((s) => s.isOption);
  const lastOption = day.stops.findLastIndex((s) => s.isOption);
  const at = current ?? from;
  const optionsPast = pivotIdx > lastOption && !!at && day.stops.indexOf(at) >= firstOption;
  const earlier = day.stops.filter((s, i) => (s.isOption ? optionsPast : i < pivotIdx));
  // The cards already show the current stop and (when there is one) the next one.
  const later = day.stops.filter((s, i) => (s.isOption ? !optionsPast : i > pivotIdx && !(current && s === next)));

  return (
    <>
      <DayHeader day={day} total={trip!.days.length} aside={<WeatherSummary day={day} />} />
      <TranslateShortcuts end={<ViewPill view={view} onChange={setView} />} />
      {view === 'map' && (
        <div className="mb-6">
          <DayMap day={day} hotel={hotel} currentKey={(current ?? next)?.key} />
        </div>
      )}
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
        <div className="lg:sticky lg:top-6">
          <NowNext day={day} now={current} next={next} from={from} />
        </div>
        <div className="lg:[&>:first-child]:mt-0">
          {later.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-2 text-lg font-semibold tracking-tight">Later today</h2>
              <Timeline day={day} stops={later} hotel={hotel} />
            </section>
          ) : (
            hotel && (
              <section className="mt-6">
                <Timeline day={day} stops={[]} hotel={hotel} homeAnyway />
              </section>
            )
          )}
          <AddStop day={day} />
          <div className="mt-6">
            <DayForecast day={day} />
          </div>
          <TodaySpend day={day} />

          {earlier.length > 0 && (
            <section className="mt-6">
              <button
                onClick={() => setShowEarlier((s) => !s)}
                className="flex min-h-12 items-center gap-2 text-[15px] font-medium text-ink-soft"
                aria-expanded={showEarlier}
              >
                <CaretRight size={16} className={`transition-transform ${showEarlier ? 'rotate-90' : ''}`} />
                Earlier today ({earlier.length})
              </button>
              {showEarlier && <Timeline day={day} stops={earlier} />}
            </section>
          )}
          <DayPhotos day={day} />
        </div>
      </div>
    </>
  );
}

function BeforeTrip({ now }: { now: Date }) {
  const { trip } = useTripData();
  const first = trip!.days[0];
  const firstHotel = hotelFor(trip!.days, 0, trip!.hotels);
  const [view, setView] = useView();
  const daysToGo = useMemo(() => {
    const today = Date.parse(`${tokyoClock(now).isoDate}T00:00:00Z`);
    return Math.round((Date.parse(`${first.isoDate}T00:00:00Z`) - today) / 86_400_000);
  }, [now, first.isoDate]);

  return (
    <>
      <header className="relative -mx-4 md:-mx-8 grid gap-2 px-4 md:px-8 pt-2 pb-6">
        <CityPattern city={cityOf(first.city).key} className="-top-24 text-accent opacity-[0.10] dark:opacity-[0.16]" />
        <p className="relative text-sm font-medium text-ink-faint">
          {TRIP.travellers} · {TRIP.name}
        </p>
        <h1 className="relative text-[44px] leading-[1.05] font-semibold tracking-tight">
          <span className="tabular text-accent-text">{daysToGo}</span> {daysToGo === 1 ? 'day' : 'days'} to go
        </h1>
        <p className="relative text-[15px] text-ink-soft">
          Wheels down at Kansai on {first.dateLabel}. Here is how Day 1 plays out.
        </p>
        {firstHotel && <HotelPill hotel={firstHotel} />}
      </header>
      <TranslateShortcuts end={<ViewPill view={view} onChange={setView} />} />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div>
          {view === 'map' ? (
            <DayMap day={first} hotel={firstHotel} />
          ) : (
            <section className="rounded-[28px] border border-line bg-card p-3">
              <Timeline day={first} hotel={firstHotel} />
              <AddStop day={first} />
            </section>
          )}
          <Link
            href="/days"
            className="mt-4 flex min-h-14 items-center justify-between rounded-2xl bg-accent px-5 text-base font-semibold text-accent-ink active:scale-[0.99]"
          >
            See all {trip!.days.length} days
            <CaretRight size={20} />
          </Link>
        </div>
        <div className="lg:[&>:first-child]:mt-0">
          <Checklist />
        </div>
      </div>
    </>
  );
}

function AfterTrip() {
  return <Recap />;
}
