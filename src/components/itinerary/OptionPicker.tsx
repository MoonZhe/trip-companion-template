'use client';
import { Check } from '@phosphor-icons/react';
import type { Day, Hotel, Stop } from '@/lib/sheet/types';
import { useTripData } from '@/components/providers/TripData';
import { cityForStop } from '@/lib/trip/city';
import { StopDetails, nextLinkFor } from './StopRow';

const label = (s: Stop) => s.title.replace(/^\[Option ([A-Z])\]\s*/, '');

/** "[Option A/B…]" rows: pick one. The pick is shared between both phones. */
export function OptionPicker({ day, options, hotel }: { day: Day; options: Stop[]; hotel?: Hotel | null }) {
  const { checks, choose } = useTripData();
  const prefix = `choice-d${day.day}:`;
  const picked = options.find((o) => checks.has(`${prefix}${o.key}`));

  return (
    <li data-options className="grid scroll-mt-4 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 py-2">
      <div className="tabular pt-1 text-right font-mono text-sm text-ink-soft">{options[0]?.time}</div>
      <div className="grid gap-2">
        <p className="text-[15px] font-semibold">Pick one</p>
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => {
            const on = picked?.key === o.key;
            return (
              <button
                key={o.key}
                onClick={() => choose(prefix, o.key)}
                aria-pressed={on}
                className={`relative min-h-20 rounded-2xl border p-3 text-left text-[15px] leading-snug font-medium transition active:scale-[0.98] ${
                  on ? 'border-accent bg-accent-soft' : 'border-line bg-card'
                }`}
              >
                {label(o)}
                {on && <Check size={18} weight="bold" className="absolute top-3 right-3 text-accent-text" />}
              </button>
            );
          })}
        </div>
        {picked && (
          <div className="rounded-2xl bg-accent-soft pt-3">
            <StopDetails
              stop={picked}
              dayCity={cityForStop(day, picked)}
              next={nextLinkFor(day, picked, hotel)}
              isoDate={day.isoDate}
            />
          </div>
        )}
      </div>
    </li>
  );
}
