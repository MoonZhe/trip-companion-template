'use client';
import { useState } from 'react';
import { ListBullets, MapTrifold } from '@phosphor-icons/react';

export type View = 'list' | 'map';

/** List or map, remembered on this phone. */
export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('view') === 'map' ? 'map' : 'list';
    } catch {
      return 'list';
    }
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem('view', v);
      } catch {
        // Private mode: just don't remember it.
      }
    },
  ];
}

/** One small pill that flips between the list and the map (Today and Days). */
export function ViewPill({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const map = view === 'map';
  const Icon = map ? ListBullets : MapTrifold;
  return (
    <button
      onClick={() => onChange(map ? 'list' : 'map')}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-sm font-medium whitespace-nowrap active:scale-[0.97]"
    >
      <Icon size={16} weight="fill" className="shrink-0 text-accent-text max-[359px]:hidden" />
      {map ? 'List' : 'Map'}
    </button>
  );
}
