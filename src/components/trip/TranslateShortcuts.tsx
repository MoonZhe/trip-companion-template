'use client';
import { useState } from 'react';
import { Camera, Translate } from '@phosphor-icons/react';
import { Converter } from '@/components/money/Converter';
import { useTripData } from '@/components/providers/TripData';
import { Sheet } from '@/components/ui/Sheet';
import { SearchButton } from '@/components/search/Search';

interface Shortcut {
  label: string;
  /** The pill's text. */
  short: string;
  hint: string;
  Icon: typeof Camera;
  /** iPhone: the app's own link (opens the app if it's installed). */
  ios: string;
  /** Android, or the iPhone without the app: the web page, which Android hands to the app. */
  web: string;
}

const SHORTCUTS: Shortcut[] = [
  {
    label: 'Google Lens',
    short: 'Lens',
    hint: 'Point the camera at menus and signs',
    Icon: Camera,
    ios: 'googleapp://lens',
    web: 'https://lens.google.com/',
  },
  {
    label: 'Google Translate',
    short: 'Translate',
    hint: 'Type, talk, or translate a conversation',
    Icon: Translate,
    ios: 'googletranslate://',
    web: 'https://translate.google.com/?sl=ja&tl=en',
  },
];

/** Open the app; if nothing happened after a moment (not installed), open the web version instead. */
function open(s: Shortcut) {
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    window.open(s.web, '_blank', 'noreferrer');
    return;
  }
  const fallback = setTimeout(() => {
    if (document.visibilityState === 'visible') window.open(s.web, '_blank', 'noreferrer');
  }, 1200);
  document.addEventListener('visibilitychange', () => clearTimeout(fallback), { once: true });
  window.location.href = s.ios;
}

/**
 * Small pills into Google's translation apps, for anything the phrase cards don't cover, plus the
 * Money tab's yen ⇄ ringgit converter and the trip search. `end` sits at the right of the row.
 */
export function TranslateShortcuts({ end }: { end?: React.ReactNode }) {
  const { trip } = useTripData();
  const [converter, setConverter] = useState(false);
  return (
    // One row on a phone: tight pills, and the Lens/Translate icons drop out below 420px to make room for search.
    <div className="mb-4 flex items-center gap-1.5">
      {SHORTCUTS.map((s) => (
        <button
          key={s.label}
          onClick={() => open(s)}
          aria-label={`${s.label}: ${s.hint}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-sm font-medium whitespace-nowrap active:scale-[0.97]"
        >
          <s.Icon size={16} weight="fill" className="shrink-0 text-accent-text max-[419px]:hidden" />
          {s.short}
        </button>
      ))}
      {trip && (
        <button
          onClick={() => setConverter(true)}
          aria-label="Convert yen and ringgit"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-sm font-medium whitespace-nowrap active:scale-[0.97]"
        >
          ¥⇄RM
        </button>
      )}
      {trip && <SearchButton />}
      {end && <div className="ml-auto shrink-0">{end}</div>}
      {trip && (
        <Sheet open={converter} onClose={() => setConverter(false)} title="Yen and ringgit">
          <Converter rate={trip.jpyPerRm} onLog={() => setConverter(false)} />
        </Sheet>
      )}
    </div>
  );
}
