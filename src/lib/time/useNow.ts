'use client';
import { TRIP } from '@/trip.config';
import { useEffect, useState } from 'react';

/** `?at=2026-10-28T10:00` (Japan time) pins the clock, handy for previewing a trip day. */
function pinnedTime(): Date | null {
  if (typeof window === 'undefined') return null;
  const at = new URLSearchParams(window.location.search).get('at');
  if (!at) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : `${at}${TRIP.utcOffset}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Current time, ticking every 30s (or the pinned time). */
export function useNow(): Date {
  const [pinned] = useState(pinnedTime);
  const [now, setNow] = useState(() => pinned ?? new Date());
  useEffect(() => {
    if (pinned) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [pinned]);
  return now;
}
