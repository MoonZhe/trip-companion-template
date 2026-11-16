'use client';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { X } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The part of the screen that's actually visible: above the iPhone keyboard, and wherever iOS has
 * panned to when a field takes focus. A fixed overlay sized to it keeps the sheet's header (and its
 * Save) on screen while typing, instead of sliding up under the status bar or down behind the keys.
 */
function useVisibleArea(on: boolean): { top: number; height: number } | null {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!on || !vv) return;
    const update = () => setArea({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setArea(null);
    };
  }, [on]);
  return area;
}

/** Bottom sheet. Closes on backdrop tap, Escape, or dragging the handle down. `action` sits in the title row. */
export function Sheet({
  open,
  onClose,
  title,
  action,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  action?: React.ReactNode;
  /** False while there's typed input to lose: then only the ✕ closes it (not the backdrop, a drag or Escape). */
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const area = useVisibleArea(open);
  const body = useRef<HTMLDivElement>(null);
  // The sheet is portalled to <body> so drags inside it can't swipe the day page or pull to refresh
  // behind it. That takes it out from under the shell's city colour, so carry --accent across.
  const anchor = useRef<HTMLSpanElement>(null);
  const [accent, setAccent] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    setAccent(getComputedStyle(anchor.current).getPropertyValue('--accent').trim() || null);
  }, [open]);

  // When the keyboard comes up or goes, keep the field being typed in on screen.
  useEffect(() => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && body.current?.contains(a)) a.scrollIntoView({ block: 'nearest' });
  }, [area?.height]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissible && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissible]);

  return (
    <>
      <span ref={anchor} hidden />
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div
                className="fixed inset-x-0 top-0 bottom-0 z-40"
                style={
                  {
                    ...(area ? { top: area.top, height: area.height, bottom: 'auto' } : {}),
                    ...(accent ? { '--accent': accent } : {}),
                  } as React.CSSProperties
                }
                role="dialog"
                aria-modal="true"
                aria-label={title}
              >
                <motion.button
                  aria-hidden
                  tabIndex={-1}
                  className="absolute inset-0 bg-black/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => dismissible && onClose()}
                />
                <motion.div
                  className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92%] max-w-lg flex-col md:max-w-xl rounded-t-[28px] bg-card shadow-soft"
                  initial={reduce ? { opacity: 0 } : { y: '100%' }}
                  animate={reduce ? { opacity: 1 } : { y: 0 }}
                  exit={reduce ? { opacity: 0 } : { y: '100%' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  drag={reduce || !dismissible ? false : 'y'}
                  dragListener={false}
                  dragControls={controls}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.6 }}
                  onDragEnd={(_, info) => info.offset.y > 120 && onClose()}
                >
                  <div
                    className="flex h-7 shrink-0 cursor-grab touch-none items-end justify-center"
                    onPointerDown={(e) => controls.start(e)}
                  >
                    <div className="h-1.5 w-10 rounded-full bg-line" />
                  </div>
                  <div className="flex items-center justify-between px-5 pt-3 pb-2">
                    <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                    <div className="flex items-center gap-1">
                      {action}
                      <button
                        type="button"
                        onClick={onClose}
                        className="grid size-11 place-items-center rounded-full text-ink-soft active:scale-95"
                        aria-label="Close"
                      >
                        <X size={22} />
                      </button>
                    </div>
                  </div>
                  <div
                    ref={body}
                    className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                  >
                    {children}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
