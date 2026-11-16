'use client';
import { useEffect, useState } from 'react';
import { Camera } from '@phosphor-icons/react';
import type { Day } from '@/lib/sheet/types';
import { useTripData } from '@/components/providers/TripData';
import { AttachButton, FileViewer } from '@/components/files/Files';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { fileBlob, type TripFile } from '@/lib/files/store';

/** A square thumbnail of a saved photo (loaded from this phone first). Without `onOpen` it's just a picture. */
export function PhotoThumb({ file, onOpen, className = '' }: { file: TripFile; onOpen?: () => void; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    fileBlob(supabaseBrowser(), file)
      .then((b) => {
        if (!b || cancelled) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  const img = url && <img src={url} alt="" className="size-full object-cover" />;
  if (!onOpen) return <span className={`block overflow-hidden rounded-2xl bg-sunk ${className}`}>{img}</span>;
  return (
    <button type="button"
      onClick={onOpen}
      className={`overflow-hidden rounded-2xl bg-sunk active:scale-[0.98] ${className}`}
      aria-label={`Open photo ${file.label}`}
    >
      {img}
    </button>
  );
}

/** Photos of the day, for the trip recap. */
export function DayPhotos({ day }: { day: Day }) {
  const { files } = useTripData();
  const [open, setOpen] = useState<TripFile | null>(null);
  const photos = files.filter((f) => f.kind === 'photo' && f.trip_day === day.day);
  return (
    <section className="mt-8 grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Photos of the day</h2>
        <span className="text-xs text-ink-faint">For the trip recap</span>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <PhotoThumb key={p.id} file={p} onOpen={() => setOpen(p)} className="aspect-square" />
          ))}
        </div>
      )}
      <AttachButton accept="image/*" multiple link={{ kind: 'photo', trip_day: day.day, label: `Day ${day.day}` }}>
        <Camera size={18} />
        Add photos
      </AttachButton>
      <FileViewer file={open} onClose={() => setOpen(null)} />
    </section>
  );
}
