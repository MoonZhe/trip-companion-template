import { Clock } from '@phosphor-icons/react';
import { hoursWarning, type HoursCheck } from '@/lib/trip/hours';

/** An amber pill when the place will be shut at the planned time. Nothing otherwise. */
export function HoursBadge({ info }: { info?: { check: HoursCheck | null } }) {
  const text = info?.check ? hoursWarning(info.check) : null;
  if (!text) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[color-mix(in_oklab,#d97706_16%,var(--card))] text-caution-text">
      <Clock size={13} weight="fill" />
      {text}
    </span>
  );
}

/** The place's opening hours on the planned day, for the expanded stop. */
export function HoursLine({ info }: { info?: { today: string | null } }) {
  if (!info?.today) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft">
      <Clock size={16} className="text-accent-text" />
      Open that day: <span className="font-semibold text-ink">{info.today}</span>
    </p>
  );
}
