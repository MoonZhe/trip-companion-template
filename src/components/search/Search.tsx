'use client';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bed, ChatText, MagnifyingGlass, ShoppingBag, Siren, Ticket, X, type Icon } from '@phosphor-icons/react';
import { useTripData, type WishItem } from '@/components/providers/TripData';
import { useShell } from '@/components/shell/AppShell';
import { Sheet } from '@/components/ui/Sheet';
import { WishSheet } from '@/components/money/WishSheet';
import { FileViewer } from '@/components/files/Files';
import { CATEGORY_UI } from '@/components/money/categories';
import { CardViewer, HELP, PHRASES, hotelCard, type Card } from '@/components/trip/StaffCards';
import { search, terms, type Hit, type Snippet } from '@/lib/search/search';
import { jpy, rm, shortDate } from '@/lib/format';
import type { Expense } from '@/lib/money/compute';
import type { TripFile } from '@/lib/files/store';

/** Days listens for this to jump to a stop when it's already on screen. */
export const GOTO_STOP = 'trip:goto-stop';
export type GotoStop = { day: number; key: string };

/** Opens a stop on the Days tab: that day, scrolled to the stop with its details open. */
export function useGoToStop() {
  const router = useRouter();
  const pathname = usePathname();
  return (day: number, key: string) => {
    if (pathname.startsWith('/days'))
      window.dispatchEvent(new CustomEvent<GotoStop>(GOTO_STOP, { detail: { day, key } }));
    else router.push(`/days?d=${day}&s=${encodeURIComponent(key)}`);
  };
}

type Target =
  | { kind: 'card'; card: Card }
  | { kind: 'wish'; id: string }
  | { kind: 'file'; file: TripFile };

/** The 🔍 pill: search the whole trip. Works offline, since it only looks at what's on the phone. */
export function SearchButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const { wishlist } = useTripData();
  // Results open over the page, not over the search, which closes first.
  const show = (t: Target) => {
    setOpen(false);
    setTarget(t);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search the trip"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-line bg-card px-2.5 active:scale-[0.97]"
      >
        <MagnifyingGlass size={18} weight="bold" className="text-accent-text" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Search">
        <SearchBody query={query} onQuery={setQuery} onShow={show} onDone={() => setOpen(false)} />
      </Sheet>
      <CardViewer
        cards={target?.kind === 'card' ? [target.card] : []}
        index={target?.kind === 'card' ? 0 : null}
        onIndex={(i) => i === null && setTarget(null)}
      />
      <WishSheet
        item={target?.kind === 'wish' ? (wishlist.find((w) => w.id === target.id) ?? null) : null}
        onClose={() => setTarget(null)}
      />
      <FileViewer file={target?.kind === 'file' ? target.file : null} onClose={() => setTarget(null)} />
    </>
  );
}

const LIMIT = 30;
const stopName = (title: string) => title.replace(/^\[Option [A-Z]\]\s*/, '');

function SearchBody({
  query,
  onQuery,
  onShow,
  onDone,
}: {
  query: string;
  onQuery: (q: string) => void;
  onShow: (t: Target) => void;
  onDone: () => void;
}) {
  const { trip, wishlist, expenses, files } = useTripData();
  const { openQuickAdd } = useShell();
  const goToStop = useGoToStop();
  const input = useRef<HTMLInputElement>(null);

  // Same moment as autoFocus, so the keyboard opens; no scroll while the sheet slides in.
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);

  const results = useMemo(() => {
    if (!trip) return null;
    const stops = trip.days.flatMap((d) => d.stops.map((s) => ({ ...s, dateLabel: shortDate(d.isoDate) })));
    const cards = [...trip.hotels.filter((h) => h.ja).map(hotelCard), ...PHRASES, ...HELP];
    const hotelOf = new Map(trip.hotels.map((h) => [`hotel-${h.name}`, h]));
    const tickets = files.filter((f) => f.kind === 'ticket');
    const byDate = [...expenses].sort((a, b) => b.spent_on.localeCompare(a.spent_on));
    return {
      stops: search(stops, query, (s) => [s.title, s.tips, s.travelNext, s.category, s.bookAhead, `day ${s.day}`, s.dateLabel]),
      cards: search(cards, query, (c) => {
        const h = hotelOf.get(c.id);
        return h ? [h.name, h.area, h.city, h.notes, h.ja] : [c.en, c.say, c.ja];
      }),
      wishes: search(wishlist, query, (w) => [w.label, w.notes, w.url]),
      expenses: search(byDate, query, (e) => [e.note, CATEGORY_UI[e.category].label, String(e.amount), shortDate(e.spent_on)]),
      tickets: search(tickets, query, (f) => [f.label]),
    };
  }, [trip, wishlist, expenses, files, query]);

  const total = results ? Object.values(results).reduce((n, r) => n + r.length, 0) : 0;

  return (
    <div className="grid min-h-[50vh] content-start gap-5">
      <div className="sticky top-0 z-10 -mx-5 bg-card px-5 pb-1">
        <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-sunk px-3 focus-within:border-accent">
          <MagnifyingGlass size={18} className="shrink-0 text-ink-faint" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder="Stops, tips, hotels, shopping…"
            aria-label="Search the trip"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onQuery('');
                input.current?.focus({ preventScroll: true });
              }}
              aria-label="Clear"
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-faint active:scale-95"
            >
              <X size={16} />
            </button>
          )}
        </label>
      </div>

      {!results || !query.trim() ? (
        <p className="text-[15px] text-ink-soft">
          Search the plan, tips, hotels, Japanese cards, shopping list, expenses and tickets. Works offline.
        </p>
      ) : total === 0 ? (
        <p className="text-[15px] text-ink-soft">{terms(query).length ? 'Nothing found.' : 'Keep typing…'}</p>
      ) : (
        <>
          <Section title="Plan" hits={results.stops}>
            {(h) => (
              <Row
                key={h.item.key}
                title={stopName(h.item.title)}
                meta={`Day ${h.item.day} · ${h.item.dateLabel}${h.item.time ? ` · ${h.item.time}` : ''}`}
                snippet={h.snippet}
                onClick={() => {
                  onDone();
                  goToStop(h.item.day, h.item.key);
                }}
              />
            )}
          </Section>
          <Section title="Hotels and Japanese" hits={results.cards}>
            {(h) => (
              <Row
                key={h.item.id}
                Icon={h.item.kind === 'hotel' ? Bed : h.item.kind === 'help' ? Siren : ChatText}
                title={h.item.kind === 'hotel' ? h.item.en.split('.')[0] : h.item.en}
                meta={h.item.kind === 'hotel' ? 'Show staff the address' : h.item.say}
                snippet={h.snippet}
                onClick={() => onShow({ kind: 'card', card: h.item })}
              />
            )}
          </Section>
          <Section title="Shopping" hits={results.wishes}>
            {(h: Hit<WishItem>) => (
              <Row
                key={h.item.id}
                Icon={ShoppingBag}
                title={h.item.label}
                snippet={h.snippet}
                onClick={() => onShow({ kind: 'wish', id: h.item.id })}
              />
            )}
          </Section>
          <Section title="Expenses" hits={results.expenses}>
            {(h: Hit<Expense>) => {
              const Icon = CATEGORY_UI[h.item.category].Icon;
              return (
                <Row
                  key={h.item.client_id}
                  Icon={Icon}
                  title={h.item.note || CATEGORY_UI[h.item.category].label}
                  meta={`${h.item.currency === 'JPY' ? jpy(h.item.amount) : rm(h.item.amount)} · ${shortDate(h.item.spent_on)}`}
                  snippet={h.snippet}
                  onClick={() => {
                    onDone();
                    openQuickAdd({ expense: h.item });
                  }}
                />
              );
            }}
          </Section>
          <Section title="Tickets" hits={results.tickets}>
            {(h: Hit<TripFile>) => (
              <Row key={h.item.id} Icon={Ticket} title={h.item.label || 'Ticket'} onClick={() => onShow({ kind: 'file', file: h.item })} />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section<T>({ title, hits, children }: { title: string; hits: Hit<T>[]; children: (h: Hit<T>) => React.ReactNode }) {
  if (!hits.length) return null;
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium text-ink-faint">
        {title}
        {hits.length > LIMIT ? ` · first ${LIMIT} of ${hits.length}` : ''}
      </h3>
      <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-card">
        {hits.slice(0, LIMIT).map(children)}
      </ul>
    </section>
  );
}

function Row({
  title,
  meta,
  snippet,
  Icon,
  onClick,
}: {
  title: string;
  meta?: string;
  snippet?: Snippet | null;
  Icon?: Icon;
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-start gap-3 px-4 py-2.5 text-left active:bg-sunk">
        {Icon && <Icon size={18} className="mt-0.5 shrink-0 text-accent-text" />}
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
          <span className="text-[15px] leading-snug font-medium">{title}</span>
          {meta && <span className="truncate text-xs text-ink-faint">{meta}</span>}
          {snippet && (
            <span className="line-clamp-2 text-sm text-ink-soft [overflow-wrap:anywhere]">
              {snippet.before}
              <mark className="rounded bg-accent-soft px-0.5 text-ink">{snippet.hit}</mark>
              {snippet.after}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
