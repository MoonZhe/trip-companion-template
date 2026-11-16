'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowsClockwise,
  CalendarDots,
  CircleNotch,
  CloudSlash,
  Plus,
  SquaresFour,
  SunHorizon,
  Wallet,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { TripDataProvider, useTripData } from '@/components/providers/TripData';
import { QuickAddSheet, type QuickAddDraft } from '@/components/money/QuickAddSheet';
import { cityOf } from '@/lib/trip/city';
import { warmStations } from '@/lib/maps/stations';
import { warmHours } from '@/lib/maps/hours';
import { tripDayIndex } from '@/lib/time/now';
import { useNow } from '@/lib/time/useNow';
import type { Person } from '@/lib/allowlist';

type Toast = { id: number; text: string; undo?: () => void };

const ShellCtx = createContext<{
  openQuickAdd: (d?: QuickAddDraft) => void;
  /** A short note above the tab bar for 5 s, with Undo when `undo` is given. */
  toast: (text: string, undo?: () => void) => void;
  /** The page's city colour (Days: the day on screen), or null for today's. */
  setPageAccent: (accent: string | null) => void;
} | null>(null);
export const useShell = () => useContext(ShellCtx)!;

/** The one scrolling area (see Shell). */
const SCROLLER = 'app-scroll';
const scroller = () => (typeof document === 'undefined' ? null : document.getElementById(SCROLLER));

const TABS = [
  { href: '/', label: 'Today', Icon: SunHorizon },
  { href: '/days', label: 'Days', Icon: CalendarDots },
  { href: '/money', label: 'Money', Icon: Wallet },
  { href: '/more', label: 'More', Icon: SquaresFour },
] as const;

export function AppShell({ person, children }: { person: Person; children: React.ReactNode }) {
  return (
    <TripDataProvider person={person}>
      <Shell>{children}</Shell>
    </TripDataProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { trip, online, unsynced, dropped, clearDropped } = useTripData();
  const now = useNow();
  const [draft, setDraft] = useState<QuickAddDraft | null>(null);
  const [openId, setOpenId] = useState(0);
  const openQuickAdd = useCallback((d: QuickAddDraft = {}) => {
    setOpenId((n) => n + 1);
    setDraft(d);
  }, []);
  const [note, setNote] = useState<Toast | null>(null);
  const toast = useCallback((text: string, undo?: () => void) => setNote({ id: Date.now(), text, undo }), []);
  // Stable, so the toast's 5 s timer isn't restarted by every re-render of the shell.
  const dismissToast = useCallback(() => setNote(null), []);
  const [pageAccent, setPageAccent] = useState<string | null>(null);
  const ctx = useMemo(() => ({ openQuickAdd, toast, setPageAccent }), [openQuickAdd, toast]);

  // Once per app open, quietly look up any stations we don't have yet, so every day works offline.
  const warmed = useRef(false);
  useEffect(() => {
    if (!trip || warmed.current || !online) return;
    // Mark it done only once the timer fires: the network copy of the trip replacing the cached one
    // (or going offline) within the 4 s clears this timer, and the effect must arm it again.
    const t = setTimeout(() => {
      warmed.current = true;
      void warmStations(trip.days).then(() => warmHours(trip.days));
    }, 4000);
    return () => clearTimeout(t);
  }, [trip, online]);

  const pathname = usePathname();
  useEffect(() => {
    scroller()?.scrollTo(0, 0);
  }, [pathname]);

  const accent = useMemo(() => {
    if (pageAccent) return pageAccent;
    if (!trip?.days.length) return undefined;
    const i = tripDayIndex(trip.days, now);
    const day = i === 'before' ? trip.days[0] : i === 'after' ? trip.days.at(-1)! : trip.days[i];
    return cityOf(day.city).accent;
  }, [trip, now, pageAccent]);

  return (
    <ShellCtx.Provider value={ctx}>
      {/*
        The frame fills the screen and never scrolls; only the content area (#app-scroll) does, with
        the tab bar as an ordinary block below it. A position: fixed tab bar over a scrolling page
        drifts up the screen on iPad/iPhone Safari as its toolbars resize.
      */}
      <div
        style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
        className="fixed inset-0 flex flex-col overflow-hidden"
      >
        <SyncStatus online={online} unsynced={unsynced} />
        {dropped > 0 && <DroppedNotice count={dropped} onDismiss={clearDropped} />}
        <div id={SCROLLER} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
          <PullToRefresh>
            <main className="mx-auto max-w-lg pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-[max(2rem,env(safe-area-inset-left))] md:pr-[max(2rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-28 md:max-w-3xl lg:max-w-6xl">
              {children}
            </main>
          </PullToRefresh>
        </div>

        <ExpenseButton onClick={() => openQuickAdd()} />
        <ToastBar note={note} onDone={dismissToast} />

        <TabBar />
        <QuickAddSheet draft={draft} openId={openId} onClose={() => setDraft(null)} />
      </div>
    </ShellCtx.Provider>
  );
}

/**
 * The bottom tabs. All four are loaded in full ahead of time (`prefetch`, kept for an hour by
 * staleTimes in next.config), so switching is instant.
 * A tapped tab lights up straight away; if it still has to load, its icon becomes a spinner.
 */
function TabBar() {
  const pathname = usePathname();
  // The tab tapped from this page, shown as current until the new page arrives.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const pending = tapped && tapped.from === pathname ? tapped.href : null;

  return (
    <nav
      className="relative z-20 shrink-0 border-t border-line bg-card/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur"
      aria-label="Main"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const here = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const on = pending ? pending === href : here;
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch
                onClick={() =>
                  here ? scroller()?.scrollTo({ top: 0, behavior: 'smooth' }) : setTapped({ href, from: pathname })
                }
                aria-current={here ? 'page' : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors active:scale-95 ${
                  on ? 'text-accent-text' : 'text-ink-faint'
                }`}
              >
                <TabIcon Icon={Icon} on={on} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TabIcon({ Icon, on }: { Icon: PhosphorIcon; on: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <CircleNotch size={26} className="animate-spin" aria-label="Loading" />
  ) : (
    <Icon size={26} weight={on ? 'fill' : 'regular'} />
  );
}

/**
 * Offline: a slim, quiet strip. Online: nothing, unless saving is taking a while (then a small
 * pill), because most changes sync in well under a second.
 */
function SyncStatus({ online, unsynced }: { online: boolean; unsynced: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!online || unsynced === 0) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [online, unsynced]);

  if (!online)
    return (
      <div className="relative z-30 flex shrink-0 items-center justify-center gap-1.5 border-b border-line bg-sunk/95 px-4 pt-[max(0.35rem,env(safe-area-inset-top))] pb-1.5 text-xs text-ink-soft backdrop-blur">
        <CloudSlash size={13} />
        Offline{unsynced > 0 ? ` · ${unsynced} change${unsynced > 1 ? 's' : ''} saved, will sync later` : ''}
      </div>
    );
  if (!slow || unsynced === 0) return null;
  return (
    <div className="pointer-events-none fixed top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-30 flex items-center gap-1.5 rounded-full border border-line bg-card/95 px-2.5 py-1 text-xs text-ink-soft shadow-soft backdrop-blur">
      <ArrowsClockwise size={12} className="animate-spin" />
      Syncing {unsynced}
    </div>
  );
}

/** Changes the server refused for good (rare): say so once, rather than losing them silently. */
function DroppedNotice({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="relative z-30 flex shrink-0 items-center gap-3 border-b border-line bg-sunk px-4 pt-[max(0.35rem,env(safe-area-inset-top))] pb-1 text-sm text-warn"
    >
      <span className="min-w-0 flex-1">
        {count} change{count > 1 ? 's' : ''} couldn&apos;t be saved. Check the latest entries and add {count > 1 ? 'them' : 'it'}{' '}
        again.
      </span>
      <button type="button" onClick={onDismiss} className="min-h-11 shrink-0 px-2 font-semibold">
        OK
      </button>
    </div>
  );
}

/** The toast, above the + Expense button. Polite to screen readers; never takes focus. */
function ToastBar({ note, onDone }: { note: Toast | null; onDone: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [note, onDone]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(10rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
    >
      <AnimatePresence>
        {note && (
          <motion.div
            key={note.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className={`pointer-events-auto flex min-h-12 max-w-lg min-w-0 items-center gap-3 rounded-full bg-ink py-1 pl-5 text-[15px] text-paper shadow-soft ${
              note.undo ? 'pr-1' : 'pr-5'
            }`}
          >
            <span className="min-w-0 truncate">{note.text}</span>
            {note.undo && (
              <button
                onClick={() => {
                  note.undo?.();
                  onDone();
                }}
                className="min-h-10 shrink-0 rounded-full px-4 font-semibold text-accent-soft active:scale-95"
              >
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** True while scrolling down the page (past the top), so floating buttons can get out of the way. */
function useScrollingDown(): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const y = el.scrollTop;
      if (Math.abs(y - last) < 8) return;
      setDown(y > last && y > 120);
      last = y;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  return down;
}

/** True while a text box has focus (the keyboard is up), so floating buttons don't cover the form. */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.matches('input:not([type=checkbox]):not([type=radio]), textarea, select') || t.isContentEditable);
    const onIn = (e: FocusEvent) => isField(e.target) && setTyping(true);
    const onOut = (e: FocusEvent) => isField(e.target) && setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return typing;
}

/** "+ Expense". Shrinks to a round + while scrolling down, and steps aside while typing. */
function ExpenseButton({ onClick }: { onClick: () => void }) {
  const compact = useScrollingDown();
  const typing = useTyping();
  const reduce = useReducedMotion();
  if (typing) return null;
  return (
    <motion.button
      layout={!reduce}
      onClick={onClick}
      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
      className={`fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:right-[max(2rem,env(safe-area-inset-right))] z-20 flex h-14 items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-accent-ink shadow-soft active:scale-95 ${
        compact ? 'w-14' : 'pr-5 pl-4'
      }`}
      aria-label="Add expense"
    >
      <motion.span layout={!reduce} className="grid">
        <Plus size={22} weight="bold" />
      </motion.span>
      <AnimatePresence initial={false}>
        {!compact && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
            Expense
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** Pull down at the top of the page to re-read the sheet right away. */
function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { refresh, refreshing } = useTripData();
  const reduce = useReducedMotion();
  const start = useRef<{ x: number; y: number } | null>(null);
  const [pull, setPull] = useState(0);
  const THRESHOLD = 80;

  return (
    <div
      onTouchStart={(e) => {
        // Touches in a sheet (portalled to <body>) still bubble here through React; they aren't pulls.
        if (!e.currentTarget.contains(e.target as Node)) {
          start.current = null;
          return;
        }
        const t = e.touches[0];
        start.current = (scroller()?.scrollTop ?? 0) <= 0 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchMove={(e) => {
        if (start.current === null) return;
        const t = e.touches[0];
        const dx = t.clientX - start.current.x;
        const dy = t.clientY - start.current.y;
        // A sideways swipe (the day strip, a day page) isn't a pull; drop it so the page stays still.
        if (pull === 0 && Math.abs(dx) > 8 && Math.abs(dx) > dy) {
          start.current = null;
          return;
        }
        setPull(Math.max(0, Math.min(120, dy * 0.5)));
      }}
      onTouchEnd={() => {
        if (pull >= THRESHOLD * 0.75) void refresh(true);
        start.current = null;
        setPull(0);
      }}
    >
      <div
        className="pointer-events-none flex justify-center overflow-hidden text-ink-faint"
        style={{ height: refreshing ? 40 : pull * 0.5 }}
        aria-hidden={!refreshing}
      >
        <motion.span
          className="mt-2"
          animate={refreshing && !reduce ? { rotate: 360 } : { rotate: pull * 3 }}
          transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0 }}
        >
          <ArrowsClockwise size={22} />
        </motion.span>
      </div>
      {children}
    </div>
  );
}
