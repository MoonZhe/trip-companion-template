'use client';
import { useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { Check, DotsSixVertical, Plus, X } from '@phosphor-icons/react';
import { useTripData, type WishItem } from '@/components/providers/TripData';
import { PhotoThumb } from '@/components/itinerary/DayPhotos';
import { WishSheet } from '@/components/money/WishSheet';
import { foundCount, foundLast, photosFor } from '@/lib/list/wish';
import { useArmed } from '@/lib/ui/useArmed';

export function ShoppingList() {
  const { wishlist, checks, addWish, reorderWish } = useTripData();
  const [draft, setDraft] = useState('');
  // While dragging, keep the order locally; save it once the item is dropped.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Found items sink to the bottom (keeping their own order), so what's left to find stays on top.
  const order =
    dragOrder ??
    foundLast(
      wishlist.map((w) => w.id),
      (id) => checks.has(`wish:${id}`),
    );
  const byId = new Map(wishlist.map((w) => [w.id, w]));
  const done = wishlist.filter((w) => checks.has(`wish:${w.id}`)).length;

  const move = (id: string, by: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    reorderWish(next, id);
  };

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Shopping list</h2>
        <span className="tabular text-sm text-ink-faint">
          {done}/{wishlist.length} found
        </span>
      </div>
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={setDragOrder}
        className="divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-card"
      >
        {order.map((id) => {
          const w = byId.get(id);
          return w ? (
            <WishRow
              key={id}
              item={w}
              onDrop={() => {
                if (dragOrder) reorderWish(dragOrder, id);
                setDragOrder(null);
              }}
              onMove={(by) => move(id, by)}
              onOpen={() => setOpenId(id)}
            />
          ) : null;
        })}
      </Reorder.Group>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) addWish(draft.trim());
          setDraft('');
        }}
      >
        <label htmlFor="wish" className="sr-only">
          Add to shopping list
        </label>
        <input
          id="wish"
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add something to find"
          className="min-h-12 flex-1 rounded-2xl border border-line bg-card px-4 text-[16px] outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink active:scale-95"
          aria-label="Add"
        >
          <Plus size={20} weight="bold" />
        </button>
      </form>
      <WishSheet item={wishlist.find((w) => w.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </section>
  );
}

/** One shopping-list item. Drag the grip (or use arrow keys on it) to reorder. */
function WishRow({
  item,
  onDrop,
  onMove,
  onOpen,
}: {
  item: WishItem;
  onDrop: () => void;
  onMove: (by: -1 | 1) => void;
  onOpen: () => void;
}) {
  const { checks, files, toggleCheck, removeWish } = useTripData();
  const [armed, arm] = useArmed();
  const photos = photosFor(files, item.id);
  const { found, total } = foundCount(photos, checks);
  const sub = total ? `${found}/${total} found` : (item.notes ?? '').split('\n')[0];
  const controls = useDragControls();
  const on = checks.has(`wish:${item.id}`);
  return (
    <Reorder.Item
      value={item.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className="relative flex items-center bg-card"
      whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow)', zIndex: 1 }}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onMove(e.key === 'ArrowUp' ? -1 : 1);
          }
        }}
        className="grid h-14 w-11 shrink-0 cursor-grab touch-none place-items-center text-ink-faint active:cursor-grabbing"
        aria-label={`Reorder ${item.label}. Drag, or use the arrow keys`}
      >
        <DotsSixVertical size={20} weight="bold" />
      </button>
      <button
        onClick={() => toggleCheck(`wish:${item.id}`)}
        aria-pressed={on}
        aria-label={on ? `${item.label}: found. Tap to undo` : `Mark ${item.label} as found`}
        className="grid min-h-14 w-10 shrink-0 place-items-center"
      >
        <span
          className={`grid size-7 place-items-center rounded-full border-2 transition ${
            on ? 'border-good bg-good text-good-ink' : 'border-line text-transparent'
          }`}
        >
          <Check size={14} weight="bold" />
        </span>
      </button>
      <button onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pr-2 pl-1 text-left">
        <span className={`flex min-w-0 flex-1 flex-col ${on ? 'text-ink-faint line-through' : ''}`}>
          <span className="text-[16px]">{item.label}</span>
          {sub && <span className="line-clamp-2 text-[13px] text-ink-faint">{sub}</span>}
        </span>
        {photos[0] && <PhotoThumb file={photos[0]} className="size-11 shrink-0 rounded-xl" />}
      </button>
      <button
        onClick={() => (armed ? removeWish(item.id) : arm())}
        className={`grid min-h-14 shrink-0 place-items-center text-sm font-semibold ${armed ? 'my-2 mr-2 min-h-10 rounded-full bg-warn px-3 text-warn-ink' : 'w-14 text-ink-faint'}`}
        aria-label={armed ? `Tap again to delete ${item.label}` : `Remove ${item.label}`}
      >
        {armed ? 'Delete?' : <X size={18} />}
      </button>
    </Reorder.Item>
  );
}
