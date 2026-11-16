'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CaretLeft, CaretRight, CircleNotch, FilePdf, Image as ImageIcon, Ticket, Trash, X } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { fileBlob, type FileLink, type TripFile } from '@/lib/files/store';
import { useArmed } from '@/lib/ui/useArmed';

/**
 * A button that picks a photo or PDF and uploads it with the given link. With `multiple`, several
 * can be picked at once; `link` can then be a function of each file's position (e.g. "Receipt 2", "Receipt 3").
 */
export function AttachButton({
  link,
  children,
  accept = 'image/*,application/pdf',
  multiple = false,
  className,
  onDone,
}: {
  link: FileLink | ((i: number) => FileLink);
  children: React.ReactNode;
  accept?: string;
  multiple?: boolean;
  className?: string;
  onDone?: (f: TripFile) => void;
}) {
  const { addFile } = useTripData();
  const input = useRef<HTMLInputElement>(null);
  /** Files still to upload; 0 when idle. */
  const [left, setLeft] = useState(0);
  const busy = left > 0;
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="grid gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={
          className ??
          'inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-5 text-[15px] font-medium active:scale-[0.98] disabled:opacity-60'
        }
      >
        {busy ? <CircleNotch size={18} className="animate-spin" /> : null}
        {left > 1 ? `${left} left` : children}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!picked.length) return;
          setLeft(picked.length);
          setError(null);
          // One at a time: phones on hotel wifi choke on parallel uploads.
          for (const [i, file] of picked.entries()) {
            try {
              // Upload first: `onDone?.(await addFile(…))` skips the upload entirely when there's no onDone.
              const row = await addFile(file, typeof link === 'function' ? link(i) : link);
              onDone?.(row);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Upload failed');
              break;
            } finally {
              setLeft((n) => n - 1);
            }
          }
          setLeft(0);
        }}
      />
      {error && (
        <span role="alert" className="text-xs text-warn">
          {error}
        </span>
      )}
    </span>
  );
}

/** Small tappable chips for files; tapping one opens it full screen. */
export function FileChips({ files, big = false }: { files: TripFile[]; big?: boolean }) {
  const [open, setOpen] = useState<TripFile | null>(null);
  if (!files.length) return null;
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => {
          const Icon = f.kind === 'ticket' ? Ticket : f.mime === 'application/pdf' ? FilePdf : ImageIcon;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setOpen(f)}
                className={`inline-flex items-center gap-2 rounded-full bg-accent-soft font-semibold text-accent-text active:scale-[0.98] ${
                  big ? 'min-h-14 px-5 text-base' : 'min-h-11 px-4 text-sm'
                }`}
              >
                <Icon size={big ? 20 : 16} weight="fill" />
                <span className="max-w-[14rem] truncate">{f.label || 'Ticket'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <FileViewer file={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Full screen, dark, so a QR code scans well and staff can read it. */
export function FileViewer({
  file,
  onClose,
  onStep,
}: {
  file: TripFile | null;
  onClose: () => void;
  /** Set when there's a set of photos to page through: -1 previous, 1 next. */
  onStep?: (by: -1 | 1) => void;
}) {
  const reduce = useReducedMotion();
  // Callers pass inline closures; keep the latest without re-running effects on every render.
  const close = useRef(onClose);
  const step = useRef(onStep);
  useEffect(() => {
    close.current = onClose;
    step.current = onStep;
  });
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape closes just the viewer, not the sheet it was opened from (caught first, then stopped).
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'ArrowLeft') step.current?.(-1);
      else if (e.key === 'ArrowRight') step.current?.(1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [file]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {file && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={file.label || (file.kind === 'wish' ? 'Photo' : 'Ticket')}
          className="fixed inset-0 z-50 flex flex-col bg-black text-white"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ViewerBody
            key={file.id}
            file={file}
            onClose={() => close.current()}
            onStep={onStep ? (by) => step.current?.(by) : undefined}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ViewerBody({ file, onClose, onStep }: { file: TripFile; onClose: () => void; onStep?: (by: -1 | 1) => void }) {
  const shopping = file.kind === 'wish';
  const { removeFile } = useTripData();
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [confirm, arm, disarm] = useArmed();
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fileBlob(supabaseBrowser(), file)
      .then((b) => {
        if (cancelled) return;
        if (!b) return setMissing(true);
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <p className="flex-1 truncate text-base font-semibold">{shopping ? '' : file.label || 'Ticket'}</p>
        <button
          type="button"
          onClick={() => {
            if (!confirm) {
              setRemoveError(null);
              return arm();
            }
            disarm();
            void removeFile(file)
              .then(onClose)
              .catch(() => setRemoveError('Could not remove it. Check your signal and try again.'));
          }}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${
            confirm ? 'bg-[#a0203f]' : 'bg-white/10'
          }`}
          aria-label={confirm ? 'Tap again to remove' : 'Remove'}
        >
          <Trash size={16} />
          {confirm ? 'Tap to remove' : ''}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full bg-white/10"
          aria-label="Close"
        >
          <X size={22} />
        </button>
      </div>
      {removeError && (
        <p role="alert" className="px-4 pb-2 text-sm text-warn">
          {removeError}
        </p>
      )}
      <div className="relative flex-1 overflow-auto">
        {!url && !missing && (
          <div className="grid h-full place-items-center">
            <CircleNotch size={32} className="animate-spin opacity-70" />
          </div>
        )}
        {missing && (
          <p className="grid h-full place-items-center px-8 text-center text-[15px] opacity-80">
            This file isn&apos;t saved on this phone yet. Open it once with signal and it&apos;ll work offline after.
          </p>
        )}
        {url &&
          (file.mime === 'application/pdf' ? (
            <iframe src={url} title={file.label} className="h-full w-full bg-white" />
          ) : onStep ? (
            <SwipeImage src={url} alt={file.label} onStep={onStep} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.label} className="mx-auto h-full w-full object-contain" />
          ))}
        {onStep && (
          <>
            <button
              type="button"
              onClick={() => onStep(-1)}
              className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50"
              aria-label="Previous photo"
            >
              <CaretLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50"
              aria-label="Next photo"
            >
              <CaretRight size={22} />
            </button>
          </>
        )}
      </div>
      {shopping ? (
        <p className="min-h-6 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-lg font-semibold">
          {file.label}
        </p>
      ) : (
        <p className="px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs opacity-60">
          Turn your screen brightness up for scanning
        </p>
      )}
    </>
  );
}

/** A photo you can swipe left/right to page through a set; a short drag springs back. */
function SwipeImage({ src, alt, onStep }: { src: string; alt: string; onStep: (by: -1 | 1) => void }) {
  const start = useRef<{ x: number; t: number } | null>(null);
  const [dx, setDx] = useState(0);
  const end = (x: number) => {
    if (!start.current) return;
    const moved = x - start.current.x;
    const fast = Math.abs(moved) / Math.max(1, performance.now() - start.current.t) > 0.5;
    start.current = null;
    setDx(0);
    if (Math.abs(moved) > 60 || (fast && Math.abs(moved) > 20)) onStep(moved < 0 ? 1 : -1);
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={`mx-auto h-full w-full touch-pan-y object-contain select-none ${dx ? '' : 'transition-transform duration-200'}`}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, t: performance.now() };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => start.current && setDx(e.clientX - start.current.x)}
      onPointerUp={(e) => end(e.clientX)}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
    />
  );
}
