'use client';
import { useEffect, type RefObject } from 'react';

/**
 * Lets a sideways strip be scrolled with a mouse too: drag it, or turn the wheel over it.
 * Fingers already scroll it natively, so touch and pen are left alone. `ready` re-attaches once the
 * strip is actually on screen (it renders after the trip loads).
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>, ready: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; left: number } | null = null;
    let dragging = false;

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      start = { x: e.clientX, left: el.scrollLeft };
      dragging = false;
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      if (!dragging && Math.abs(dx) < 6) return;
      if (!dragging) {
        dragging = true;
        // Snapping fights a hand-driven scroll; it comes back on release and settles the strip.
        el.style.scrollSnapType = 'none';
        el.style.cursor = 'grabbing';
      }
      el.scrollLeft = start.left - dx;
    };
    const up = () => {
      if (!start) return;
      start = null;
      el.style.scrollSnapType = '';
      el.style.cursor = '';
    };
    // A drag ends with a click on whichever chip is under the mouse; that click shouldn't pick it.
    const click = (e: MouseEvent) => {
      if (!dragging) return;
      dragging = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // A plain mouse wheel only scrolls up and down; turn that into sideways while it can move.
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY });
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
    };
  }, [ref, ready]);
}
