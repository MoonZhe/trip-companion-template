'use client';
import { useEffect, useState } from 'react';

/**
 * Two-tap confirm for deletes: the first tap arms (the button turns red and says "Tap again"),
 * the second does it. Disarms by itself after a few seconds so a stray tap later can't delete.
 */
export function useArmed(ms = 4000): [armed: boolean, arm: () => void, disarm: () => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ms);
    return () => clearTimeout(t);
  }, [armed, ms]);
  return [armed, () => setArmed(true), () => setArmed(false)];
}
