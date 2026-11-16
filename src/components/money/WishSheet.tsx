'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowSquareOut, Camera, Check, CircleNotch, ClipboardText, Trash, X } from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { FileViewer } from '@/components/files/Files';
import { PhotoThumb } from '@/components/itinerary/DayPhotos';
import { useTripData, type WishItem } from '@/components/providers/TripData';
import { useArmed } from '@/lib/ui/useArmed';
import { cleanUrl, foundLast, hostOf, joinLinks, LINKS_MAX, linksOf, photoCheckKey, photosFor } from '@/lib/list/wish';
import type { TripFile } from '@/lib/files/store';

/** Grows a textarea to fit its text (never below its `rows`), again whenever its width changes. */
function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    fit();
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, value]);
}

const field =
  'w-full rounded-2xl border border-line bg-card px-4 text-[16px] outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-accent';

/** Details of one shopping-list item: title, description, links and photos to show staff. */
export function WishSheet({ item, onClose }: { item: WishItem | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onClose={onClose} title="Shopping item">
      {item && <WishDetails key={item.id} item={item} onClose={onClose} />}
    </Sheet>
  );
}

function WishDetails({ item, onClose }: { item: WishItem; onClose: () => void }) {
  const { files, checks, toggleCheck, updateWish, removeWish, setFileLabel, addFile, online } = useTripData();
  const [label, setLabel] = useState(item.label);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [armed, arm] = useArmed();
  // Set while typing in a field: a field only saves on blur if it was edited here, so just tapping
  // in and out can't write this phone's older text over the other phone's newer edit.
  const dirty = useRef({ label: false, notes: false });
  const picker = useRef<HTMLInputElement>(null);
  const notesBox = useRef<HTMLTextAreaElement>(null);
  // Found photos move to the end, so the ones still to find come first (in the grid and the viewer).
  const all = photosFor(files, item.id);
  const byId = new Map(all.map((p) => [p.id, p]));
  const photos = foundLast(
    all.map((p) => p.id),
    (id) => checks.has(photoCheckKey(id)),
  ).map((id) => byId.get(id)!);

  // The description grows with its text (6 lines at least), so long notes are readable without scrolling a tiny box.
  useAutoGrow(notesBox, notes);

  const saveLabel = () => {
    if (!dirty.current.label) return setLabel(item.label);
    dirty.current.label = false;
    const v = label.trim();
    if (!v) return setLabel(item.label);
    if (v !== item.label) updateWish(item.id, { label: v });
  };
  const saveNotes = () => {
    if (!dirty.current.notes) return setNotes(item.notes ?? '');
    dirty.current.notes = false;
    if (notes !== (item.notes ?? '')) updateWish(item.id, { notes });
  };
  const links = linksOf(item.url);
  /** Adds the typed link to the item's links (on blur or Return). */
  const addLink = () => {
    if (!url.trim()) return setUrlError(null);
    const v = cleanUrl(url);
    if (!v) return setUrlError("That doesn't look like a web link.");
    const joined = joinLinks([...links, v]);
    if ((joined ?? '').length > LINKS_MAX) return setUrlError('Too many links. Remove one first.');
    setUrlError(null);
    setUrl('');
    if (joined !== (item.url ?? null)) updateWish(item.id, { url: joined });
  };
  const removeLink = (link: string) => updateWish(item.id, { url: joinLinks(links.filter((l) => l !== link)) });

  const upload = async (picked: File[]) => {
    setUploadError(null);
    setUploading(picked.length);
    // One at a time: phones on hotel wifi choke on parallel uploads.
    for (const file of picked) {
      try {
        await addFile(file, { kind: 'wish', wish_id: item.id });
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Upload failed');
        break;
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setUploading(0);
  };

  /** The Paste button: reads an image copied elsewhere (e.g. long-press → Copy in Safari). */
  const pasteFromClipboard = async () => {
    setUploadError(null);
    try {
      const images: File[] = [];
      for (const entry of await navigator.clipboard.read()) {
        const type = entry.types.find((t) => t.startsWith('image/'));
        if (type) images.push(new File([await entry.getType(type)], `pasted.${type.split('/')[1]}`, { type }));
      }
      if (images.length) void upload(images);
      else setUploadError('No image copied. Long-press a photo, tap Copy, then Paste here.');
    } catch {
      setUploadError("Couldn't paste. Tap Paste when your phone asks, or use Add photo.");
    }
  };

  // Ctrl+V / the long-press Paste menu anywhere in the sheet adds copied images too.
  const canAdd = online && uploading === 0;
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  });
  useEffect(() => {
    if (!canAdd) return;
    const onPaste = (e: ClipboardEvent) => {
      const images = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!images.length) return;
      e.preventDefault();
      void uploadRef.current(images);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [canAdd]);

  const open: TripFile | null = viewing === null ? null : (photos[viewing] ?? null);

  return (
    <div className="grid gap-4 pb-2">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-ink-soft">Title</span>
        <input
          value={label}
          maxLength={120}
          onChange={(e) => {
            dirty.current.label = true;
            setLabel(e.target.value);
          }}
          onBlur={saveLabel}
          className={`${field} min-h-12`}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-ink-soft">Description</span>
        <textarea
          ref={notesBox}
          value={notes}
          maxLength={2000}
          rows={6}
          onChange={(e) => {
            dirty.current.notes = true;
            setNotes(e.target.value);
          }}
          onBlur={saveNotes}
          placeholder="Model, size, price limit, Japanese name…"
          className={`${field} max-h-[55dvh] resize-none py-3 leading-snug`}
        />
      </label>

      <div className="grid gap-1.5">
        <label htmlFor="wish-url" className="text-sm font-medium text-ink-soft">
          Websites
        </label>
        {links.length > 0 && (
          <ul className="grid gap-2">
            {links.map((link) => (
              <LinkRow key={link} link={link} onRemove={() => removeLink(link)} />
            ))}
          </ul>
        )}
        <input
          id="wish-url"
          type="url"
          inputMode="url"
          enterKeyHint="done"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
          onBlur={addLink}
          placeholder={links.length ? 'Add another link' : 'Paste a link'}
          className={`${field} min-h-12`}
        />
        {urlError && (
          <span role="alert" className="text-xs text-warn">
            {urlError}
          </span>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-ink-soft">Photos</span>
          {photos.length > 0 && (
            <span className="tabular text-xs text-ink-faint">
              {photos.filter((p) => checks.has(photoCheckKey(p.id))).length}/{photos.length} found
            </span>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {photos.map((p, i) => (
            <PhotoTile
              key={p.id}
              file={p}
              found={checks.has(photoCheckKey(p.id))}
              onOpen={() => setViewing(i)}
              onToggle={() => toggleCheck(photoCheckKey(p.id))}
              onCaption={(v) => setFileLabel(p.id, v)}
            />
          ))}
          <li className="grid aspect-square grid-rows-2 gap-2">
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => picker.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-medium text-ink-soft active:scale-[0.98] disabled:opacity-50"
            >
              {uploading > 0 ? <CircleNotch size={20} className="animate-spin" /> : <Camera size={20} />}
              {uploading > 0 ? `${uploading} left` : 'Add photo'}
            </button>
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => void pasteFromClipboard()}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-medium text-ink-soft active:scale-[0.98] disabled:opacity-50"
            >
              <ClipboardText size={20} />
              Paste
            </button>
          </li>
        </ul>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) void upload([...list]);
            e.target.value = '';
          }}
        />
        {!online && <span className="text-xs text-ink-faint">Needs signal to add photos. The ones here work offline.</span>}
        {uploadError && (
          <span role="alert" className="text-xs text-warn">
            {uploadError}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          if (!armed) return arm();
          removeWish(item.id);
          onClose();
        }}
        className={`mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-full text-[15px] font-medium ${
          armed ? 'bg-warn text-warn-ink' : 'border border-line text-ink-soft'
        }`}
      >
        <Trash size={18} />
        {armed ? 'Tap again to delete this item' : 'Delete item'}
      </button>

      <FileViewer
        file={open}
        onClose={() => setViewing(null)}
        onStep={
          photos.length > 1
            ? (by) => setViewing((i) => (i === null ? null : (i + by + photos.length) % photos.length))
            : undefined
        }
      />
    </div>
  );
}

/** One saved link: opens it, and a remove button that asks twice. */
function LinkRow({ link, onRemove }: { link: string; onRemove: () => void }) {
  const [armed, arm] = useArmed();
  return (
    <li className="flex gap-2">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-accent-soft px-4 text-sm font-semibold text-accent-text"
      >
        <span className="min-w-0 truncate">
          {hostOf(link)}
          <span className="font-normal opacity-70">{shortPath(link)}</span>
        </span>
        <ArrowSquareOut size={16} className="ml-auto shrink-0" />
      </a>
      <button
        type="button"
        onClick={() => (armed ? onRemove() : arm())}
        aria-label={armed ? 'Tap again to remove this link' : 'Remove link'}
        className={`inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl px-3 text-sm font-medium ${
          armed ? 'bg-warn text-warn-ink' : 'border border-line text-ink-soft'
        }`}
      >
        {armed ? 'Remove?' : <X size={18} />}
      </button>
    </li>
  );
}

/** The link's path, e.g. "/product/123", so two links on one site look different. */
function shortPath(link: string): string {
  try {
    const u = new URL(link);
    return u.pathname === '/' ? '' : decodeURIComponent(u.pathname);
  } catch {
    return '';
  }
}

function PhotoTile({
  file,
  found,
  onOpen,
  onToggle,
  onCaption,
}: {
  file: TripFile;
  found: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onCaption: (v: string) => void;
}) {
  const [caption, setCaption] = useState(file.label);
  const box = useRef<HTMLTextAreaElement>(null);
  // Only a caption typed here is saved, so tapping in and out can't undo the other phone's rename.
  const dirty = useRef(false);
  // Long captions wrap and the box grows to show them in full.
  useAutoGrow(box, caption);
  return (
    <motion.li layout="position" transition={{ type: 'spring', stiffness: 500, damping: 40 }} className="grid gap-1">
      <div className="relative">
        <PhotoThumb file={file} onOpen={onOpen} className={`aspect-square w-full ${found ? 'opacity-50' : ''}`} />
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={found}
          aria-label={found ? 'Found. Tap to undo' : 'Mark as found'}
          className="absolute top-0 right-0 grid size-11 place-items-center"
        >
          <span
            className={`grid size-7 place-items-center rounded-full border-2 shadow-sm ${
              found ? 'border-good bg-good text-good-ink' : 'border-white bg-black/30 text-transparent'
            }`}
          >
            <Check size={14} weight="bold" />
          </span>
        </button>
      </div>
      <textarea
        ref={box}
        value={caption}
        maxLength={120}
        rows={2}
        enterKeyHint="done"
        // A caption is one line of text: Enter finishes it instead of adding a line break.
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
        onChange={(e) => {
          dirty.current = true;
          setCaption(e.target.value.replace(/\n/g, ' '));
        }}
        onBlur={() => {
          if (!dirty.current) return setCaption(file.label);
          dirty.current = false;
          if (caption.trim() !== file.label) onCaption(caption.trim());
        }}
        placeholder="Caption"
        aria-label="Photo caption"
        className={`w-full resize-none rounded-xl bg-sunk px-3 py-2 text-[16px] leading-snug outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-accent ${
          found ? 'text-ink-faint line-through' : ''
        }`}
      />
    </motion.li>
  );
}
