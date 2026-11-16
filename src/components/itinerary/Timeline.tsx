'use client';
import { useState } from 'react';
import { Bed, Bus, ChatText, Moon, NavigationArrow, PersonSimpleWalk, Train, TrainRegional } from '@phosphor-icons/react';
import type { Day, Hotel, Stop } from '@/lib/sheet/types';
import { useStations, type Station } from '@/lib/maps/stations';
import { useHours } from '@/lib/maps/hours';
import { dayEnd } from '@/lib/trip/travel';
import { cityForStop, hotelDirectionsUrl } from '@/lib/trip/city';
import { Linkified, StopRow, nextLinkFor } from './StopRow';
import { OptionPicker } from './OptionPicker';
import { CardViewer, hotelCard } from '@/components/trip/StaffCards';

/**
 * A day's stops in order, joined by the way to get from one to the next. "Choose one" option rows
 * are grouped into a picker. With a hotel, the day ends with the way back to it.
 */
export function Timeline({
  day,
  stops,
  highlightKey,
  focusKey,
  hotel,
  homeAnyway = false,
}: {
  day: Day;
  stops?: Stop[];
  highlightKey?: string;
  /** A stop picked in search: highlighted, opened and scrolled to. A new `n` does it again. */
  focusKey?: { key: string; n: number } | null;
  hotel?: Hotel | null;
  /** Show the way back even though the day's last stop isn't in `stops` (it's the current stop). */
  homeAnyway?: boolean;
}) {
  const list = stops ?? day.stops;
  const options = list.filter((s) => s.isOption);
  const firstOptionIdx = list.findIndex((s) => s.isOption);
  const stations = useStations(day);
  const hours = useHours(day);
  const end = dayEnd(day);
  const showHome = !!hotel && !!end && (homeAnyway || list.includes(end.last)) && !/check-?in/i.test(end.last.title);

  return (
    <ol className="grid">
      {list.map((s, i) => {
        if (s.isOption)
          return i === firstOptionIdx ? <OptionPicker key="options" day={day} options={options} hotel={hotel} /> : null;
        const next = list[i + 1];
        // A leg (or the way back to the hotel) right below already shows how to get on.
        const travelShown = (!!next && !next.isOption) || (showHome && s === end?.last);
        // The leg just above names this stop's station already (train legs only).
        const prev = list[i - 1];
        const stationShown = !!prev && !prev.isOption && legShowsStation(prev.travelNext);
        return [
          <StopRow
            key={s.key}
            stop={s}
            dayCity={cityForStop(day, s)}
            highlight={s.key === highlightKey || s.key === focusKey?.key}
            focus={s.key === focusKey?.key ? focusKey.n : undefined}
            station={stations.get(s.key)}
            isoDate={day.isoDate}
            hours={hours.get(s.key)}
            next={nextLinkFor(day, s, hotel)}
            travelShown={travelShown}
            stationShown={stationShown}
          />,
          next && !next.isOption ? <Leg key={`${s.key}-leg`} travel={s.travelNext} station={stations.get(next.key)} /> : null,
        ];
      })}
      {showHome && <HomeLeg hotel={hotel!} end={end!} />}
    </ol>
  );
}

type Mode = 'shinkansen' | 'train' | 'bus' | 'walk';

function modeOf(travel: string): Mode {
  if (/shinkansen|nozomi/i.test(travel)) return 'shinkansen';
  if (/\b(jr|metro|line|train|subway|nankai|keihan|kintetsu|enoden|monorail|yurikamome|rapi)/i.test(travel)) return 'train';
  if (/\bbus\b/i.test(travel)) return 'bus';
  return 'walk';
}

function legShowsStation(travel: string): boolean {
  if (!travel || travel === '—') return false;
  const mode = modeOf(travel);
  return mode === 'train' || mode === 'shinkansen';
}

const MODE_ICON = { shinkansen: TrainRegional, train: Train, bus: Bus, walk: PersonSimpleWalk } as const;

/** The dotted join between two stops: how to get there, and the station nearest the next stop. */
function Leg({ travel, station }: { travel: string; station?: Station }) {
  const text = travel && travel !== '—' ? travel : '';
  if (!text && !station) return <li aria-hidden className="h-2" />;
  const mode = modeOf(text);
  const Icon = MODE_ICON[mode];
  return (
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
      <div aria-hidden className="flex justify-end pr-[0.2rem]">
        <span className="w-0 border-l-2 border-dotted border-line" />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 pl-3 text-[13px] leading-snug text-ink-faint [overflow-wrap:anywhere]">
        {text && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Icon size={15} weight="bold" className="shrink-0 text-accent-text" />
            <span className="min-w-0">
              <Linkified text={text} />
            </span>
          </span>
        )}
        {station && legShowsStation(text) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sunk px-2 py-0.5 text-xs font-medium text-ink-soft">
            Nearest stn: {station.name} · {station.walkMin} min walk
          </span>
        )}
      </div>
    </li>
  );
}

/** The end of the day: back to the hotel, with a heads-up on late nights. */
function HomeLeg({ hotel, end }: { hotel: Hotel; end: NonNullable<ReturnType<typeof dayEnd>> }) {
  const [showStaff, setShowStaff] = useState(false);
  return (
    <>
      <Leg travel={end.travel} />
      <li className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
        <div className="tabular pt-3.5 text-right font-mono text-sm text-ink-faint">{end.endsAt ?? ''}</div>
        <div className="grid gap-2 rounded-2xl border border-dashed border-line p-3">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Bed size={18} className="shrink-0 text-accent-text" />
            Back to {hotel.name}
          </p>
          {end.late && (
            <p className="flex gap-2 rounded-xl bg-accent-soft p-2.5 text-sm leading-snug text-ink">
              <Moon size={16} weight="fill" className="mt-0.5 shrink-0 text-accent-text" />
              <span>{end.lastTrain ?? 'Late finish. Check the last train home in Google Maps before you settle in.'}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={hotelDirectionsUrl(hotel)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line px-4 text-sm font-medium active:scale-[0.98]"
            >
              <NavigationArrow size={16} weight="fill" />
              Directions
            </a>
            {hotel.ja && (
              <button
                onClick={() => setShowStaff(true)}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line px-4 text-sm font-medium active:scale-[0.98]"
              >
                <ChatText size={16} weight="fill" />
                Show staff the address
              </button>
            )}
          </div>
          {hotel.ja && (
            <CardViewer cards={[hotelCard(hotel)]} index={showStaff ? 0 : null} onIndex={(i) => setShowStaff(i !== null)} />
          )}
        </div>
      </li>
    </>
  );
}
