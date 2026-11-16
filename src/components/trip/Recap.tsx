'use client';
import { TRIP } from '@/trip.config';
import { useState } from 'react';
import Link from 'next/link';
import { Camera, CaretRight } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { AttachButton, FileViewer } from '@/components/files/Files';
import { PhotoThumb } from '@/components/itinerary/DayPhotos';
import { CityPattern } from '@/components/ui/CityPattern';
import { totals } from '@/lib/money/compute';
import { cityOf } from '@/lib/trip/city';
import type { TripFile } from '@/lib/files/store';
import { rm0, shortDate } from '@/lib/format';

/** After we're home: the trip in numbers, then a photo and a line for each day. */
export function Recap() {
  const { trip, expenses, checks, files, rates } = useTripData();
  const [open, setOpen] = useState<TripFile | null>(null);
  const t = totals(expenses, trip!.prePayments, rates!);
  const days = trip!.days;
  const stops = days.flatMap((d) => d.stops.filter((s) => !s.isOption));
  const done = stops.filter((s) => checks.has(s.key)).length;
  const photos = files.filter((f) => f.kind === 'photo');
  const cities = [...new Set(days.map((d) => cityOf(d.city).name))];
  const biggest = days.reduce((a, d) => ((t.byDay[d.isoDate] ?? 0) > (t.byDay[a.isoDate] ?? 0) ? d : a), days[0]);

  const stats = [
    { label: 'Stops ticked off', value: `${done}/${stops.length}` },
    { label: 'Spent together', value: rm0(t.allRm) },
    { label: 'Cities', value: String(cities.length), sub: cities.join(' · ') },
    { label: 'Photos saved', value: String(photos.length) },
  ];

  return (
    <div className="grid gap-8">
      <header className="relative -mx-4 md:-mx-8 grid gap-2 overflow-hidden px-4 md:px-8 pt-2 pb-2">
        <CityPattern city={TRIP.fallbackCity} className="text-accent opacity-[0.08]" />
        <p className="relative text-sm font-medium text-ink-faint">{TRIP.name} · back home</p>
        <h1 className="relative text-[40px] leading-[1.05] font-semibold tracking-tight">What a trip.</h1>
        <p className="relative text-[15px] text-ink-soft">
          {days.length} days, {shortDate(days[0].isoDate)} to {shortDate(days.at(-1)!.isoDate)}.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`rounded-[24px] p-5 ${i === 0 ? 'bg-accent text-accent-ink' : 'border border-line bg-card'}`}
          >
            <dt className={`text-sm ${i === 0 ? 'opacity-80' : 'text-ink-faint'}`}>{s.label}</dt>
            <dd className="tabular mt-1 text-3xl font-semibold">{s.value}</dd>
            {s.sub && <dd className="mt-1 text-xs leading-snug text-ink-faint">{s.sub}</dd>}
          </div>
        ))}
      </dl>
      {(t.byDay[biggest.isoDate] ?? 0) > 0 && (
        <p className="-mt-4 text-sm text-ink-soft">
          Biggest spending day: Day {biggest.day} in {cityOf(biggest.city).name} ({rm0(t.byDay[biggest.isoDate])}).
        </p>
      )}

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Day by day</h2>
        {days.map((d) => {
          const c = cityOf(d.city);
          const dayPhotos = photos.filter((p) => p.trip_day === d.day);
          const plain = d.stops.filter((s) => !s.isOption);
          const ticked = plain.filter((s) => checks.has(s.key)).length;
          const highlights = plain.filter((s) => checks.has(s.key) && !/transport|hotel/i.test(s.category)).slice(0, 3);
          return (
            <article
              key={d.day}
              style={{ '--accent': c.accent } as React.CSSProperties}
              className="overflow-hidden rounded-[24px] border border-line bg-card"
            >
              {dayPhotos.length > 0 && (
                <div className={`grid gap-0.5 ${dayPhotos.length > 1 ? 'grid-cols-[2fr_1fr]' : ''}`}>
                  <PhotoThumb file={dayPhotos[0]} onOpen={() => setOpen(dayPhotos[0])} className="aspect-[4/3] rounded-none" />
                  {dayPhotos.length > 1 && (
                    <div className="grid gap-0.5">
                      {dayPhotos.slice(1, 3).map((p) => (
                        <PhotoThumb key={p.id} file={p} onOpen={() => setOpen(p)} className="h-full rounded-none" />
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-2 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight">
                    <span className="text-accent-text">Day {d.day}</span> · {c.name}
                  </h3>
                  <span className="tabular text-xs text-ink-faint">
                    {ticked}/{plain.length} · {shortDate(d.isoDate)}
                  </span>
                </div>
                {highlights.length > 0 && (
                  <p className="text-sm leading-snug text-ink-soft">{highlights.map((s) => s.title).join(' · ')}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <AttachButton
                    accept="image/*"
                    link={{ kind: 'photo', trip_day: d.day, label: `Day ${d.day}` }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium active:scale-[0.98] disabled:opacity-60"
                  >
                    <Camera size={16} />
                    {dayPhotos.length ? 'Add another' : 'Add a photo'}
                  </AttachButton>
                  <Link
                    href={`/days?d=${d.day}`}
                    className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-accent-text"
                  >
                    See the day <CaretRight size={14} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
      <Link href="/money" className="flex min-h-12 items-center gap-2 text-[15px] font-medium text-accent-text">
        Full money summary <CaretRight size={16} />
      </Link>
      <FileViewer file={open} onClose={() => setOpen(null)} />
    </div>
  );
}
