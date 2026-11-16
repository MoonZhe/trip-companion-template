'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, CloudArrowDown } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { hasLocalCopy } from '@/lib/files/store';

/** Whether this phone has what it needs to open the app with no signal. */
export function OfflineStatus() {
  const { files } = useTripData();
  const [pages, setPages] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Find the page cache by prefix: the worker's VERSION changes, and caches.open() on a stale
      // name would create an empty cache and report nothing saved.
      const names = 'caches' in window ? (await caches.keys()).filter((k) => k.startsWith('pages-')) : [];
      const counts = await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).length));
      const ok = !!navigator.serviceWorker?.controller && counts.some((c) => c >= 4);
      const local = (await Promise.all(files.map((f) => hasLocalCopy(f.id)))).filter(Boolean).length;
      if (!cancelled) {
        setPages(ok);
        setSaved(local);
      }
    })().catch(() => !cancelled && setPages(false));
    return () => {
      cancelled = true;
    };
  }, [files]);

  if (pages === null) return null;
  const ready = pages && saved === files.length;
  const Icon = ready ? CheckCircle : CloudArrowDown;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-sunk p-4 text-sm leading-relaxed text-ink-soft">
      <Icon size={18} weight="fill" className={`mt-0.5 shrink-0 ${ready ? 'text-good' : 'text-accent-text'}`} />
      <span>
        {pages ? 'The app is saved on this phone for offline use.' : 'Open the app once with signal to save it for offline use.'}
        {files.length > 0 && ` ${saved} of ${files.length} tickets and photos are on this phone.`}
        {!ready && ' The rest downloads by itself while you have signal.'}
      </span>
    </p>
  );
}
