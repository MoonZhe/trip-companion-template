'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bed, CaretLeft, CaretRight, ChatText, Phone, Siren, X } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import type { Hotel } from '@/lib/sheet/types';

export interface Card {
  id: string;
  /** Big text shown to staff. */
  ja: string;
  en: string;
  /** How to say it, for us. */
  say?: string;
  kind: 'hotel' | 'phrase' | 'help';
  tel?: string;
}

export const PHRASES: Card[] = [
  {
    id: 'tax',
    ja: '免税でお願いします。\nパスポートはこちらです。',
    en: 'Tax-free, please. Here is my passport.',
    say: 'Menzei de onegai shimasu',
    kind: 'phrase',
  },
  { id: 'two', ja: '2人です。', en: 'Two people, please.', say: 'Futari desu', kind: 'phrase' },
  {
    id: 'menu',
    ja: '英語のメニューはありますか？',
    en: 'Do you have an English menu?',
    say: 'Eigo no menyū wa arimasu ka?',
    kind: 'phrase',
  },
  { id: 'card', ja: 'カードで払えますか？', en: 'Can I pay by card?', say: 'Kādo de haraemasu ka?', kind: 'phrase' },
  { id: 'bill', ja: 'お会計お願いします。', en: 'The bill, please.', say: 'O-kaikei onegai shimasu', kind: 'phrase' },
  { id: 'away', ja: '持ち帰りできますか？', en: 'Can we take this away?', say: 'Mochikaeri dekimasu ka?', kind: 'phrase' },
  {
    id: 'bags',
    ja: '荷物を預かってもらえますか？',
    en: 'Could you keep our luggage for a while?',
    say: 'Nimotsu o azukatte moraemasu ka?',
    kind: 'phrase',
  },
  {
    id: 'way',
    ja: 'ここへはどうやって行けばいいですか？',
    en: 'How do we get here?',
    say: 'Koko e wa dō yatte ikeba ii desu ka?',
    kind: 'phrase',
  },
  {
    id: 'photo',
    ja: '写真を撮っていただけますか？',
    en: 'Could you take our photo?',
    say: 'Shashin o totte itadakemasu ka?',
    kind: 'phrase',
  },
  { id: 'toilet', ja: 'トイレはどこですか？', en: 'Where is the toilet?', say: 'Toire wa doko desu ka?', kind: 'phrase' },
];

export const HELP: Card[] = [
  {
    id: 'ambulance',
    ja: '救急車を呼んでください。',
    en: 'Please call an ambulance.',
    say: 'Kyūkyūsha o yonde kudasai',
    kind: 'help',
    tel: '119',
  },
  {
    id: 'police',
    ja: '警察を呼んでください。',
    en: 'Please call the police.',
    say: 'Keisatsu o yonde kudasai',
    kind: 'help',
    tel: '110',
  },
  {
    id: 'lost',
    ja: '財布（パスポート）をなくしました。',
    en: 'I lost my wallet (passport).',
    say: 'Saifu (pasupōto) o nakushimashita',
    kind: 'help',
  },
];

/** The hotel's Japanese name and address, asking the way there. */
export function hotelCard(h: Hotel): Card {
  return {
    id: `hotel-${h.name}`,
    ja: `${h.ja}\n\nこのホテルへの行き方を教えてください。`,
    en: `${h.name}. Please tell us how to get to this hotel.`,
    kind: 'hotel',
  };
}

/** Big-text cards to show hotel, shop and station staff, plus emergency numbers. Works offline. */
export function StaffCards() {
  const { trip } = useTripData();
  const [open, setOpen] = useState<number | null>(null);

  const hotels: Card[] = trip!.hotels.filter((h) => h.ja).map(hotelCard);
  const cards = [...hotels, ...PHRASES, ...HELP];

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Show to staff</h2>
        <p className="mt-1 text-sm text-ink-faint">
          Tap a card to show it full screen. Swipe or use the arrows for the next one.
        </p>
      </div>
      {/* Emergency numbers up top, one tap from dialling, rather than below every phrase card. */}
      <div className="flex gap-2">
        {HELP.filter((c) => c.tel).map((c) => (
          <a
            key={c.id}
            href={`tel:${c.tel}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-warn/40 bg-warn/5 px-4 text-[14px] font-semibold text-warn active:scale-[0.98]"
          >
            <Phone size={16} weight="fill" />
            {c.id === 'ambulance' ? 'Ambulance' : 'Police'} {c.tel}
          </a>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {cards.map((c, i) => {
          const Icon = c.kind === 'hotel' ? Bed : c.kind === 'help' ? Siren : ChatText;
          return (
            <li key={c.id} className={c.kind === 'hotel' ? 'col-span-2' : ''}>
              <button
                onClick={() => setOpen(i)}
                className={`flex h-full min-h-16 w-full items-start gap-2 rounded-2xl border p-3 text-left active:scale-[0.98] ${
                  c.kind === 'help' ? 'border-warn/40 bg-warn/5' : 'border-line bg-card'
                }`}
              >
                <Icon size={18} className={`mt-0.5 shrink-0 ${c.kind === 'help' ? 'text-warn' : 'text-accent-text'}`} />
                <span className="text-[14px] leading-snug font-medium">{c.kind === 'hotel' ? c.en.split('.')[0] : c.en}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <CardViewer cards={cards} index={open} onIndex={setOpen} />
    </section>
  );
}

export function CardViewer({
  cards,
  index,
  onIndex,
}: {
  cards: Card[];
  index: number | null;
  onIndex: (i: number | null) => void;
}) {
  const reduce = useReducedMotion();
  const card = index === null ? null : cards[index];
  const touch = useRef<number | null>(null);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndex(null);
      if (e.key === 'ArrowRight') onIndex(Math.min(cards.length - 1, index + 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, cards.length, onIndex]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {card && index !== null && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={card.en}
          className="fixed inset-0 z-50 flex flex-col bg-paper text-ink"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex justify-end px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={() => onIndex(null)}
              className="grid size-12 place-items-center rounded-full bg-sunk"
              aria-label="Close"
            >
              <X size={24} />
            </button>
          </div>
          {/* The inner box centres the card when it fits and starts at the top (scrollable) when it
              doesn't, so a long hotel card never loses its name above the top edge. */}
          <div
            className="min-h-0 flex-1 overflow-auto px-6"
            lang="ja"
            onTouchStart={(e) => {
              touch.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touch.current === null) return;
              const dx = e.changedTouches[0].clientX - touch.current;
              touch.current = null;
              if (Math.abs(dx) > 60) onIndex(Math.min(cards.length - 1, Math.max(0, index + (dx < 0 ? 1 : -1))));
            }}
          >
            <div className="flex min-h-full flex-col justify-center gap-6 py-2">
              <p
                className={`leading-snug font-bold whitespace-pre-line ${
                  card.kind === 'hotel' ? 'text-[28px]' : 'text-[40px]'
                } ${card.kind === 'help' ? 'text-warn' : ''}`}
              >
                {card.ja}
              </p>
              <div lang="en" className="grid gap-1 border-t border-line pt-4">
                <p className="text-lg text-ink-soft">{card.en}</p>
                {card.say && <p className="text-sm text-ink-faint">Say: {card.say}</p>}
                {card.tel && (
                  <a
                    href={`tel:${card.tel}`}
                    className="mt-2 inline-flex min-h-12 w-fit items-center gap-2 rounded-full bg-warn px-5 font-semibold text-warn-ink"
                  >
                    <Phone size={18} weight="fill" />
                    Call {card.tel}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => onIndex(Math.max(0, index - 1))}
              disabled={index === 0}
              className="grid size-14 place-items-center rounded-full bg-sunk disabled:opacity-30"
              aria-label="Previous card"
            >
              <CaretLeft size={24} />
            </button>
            <span className="tabular text-sm text-ink-faint">
              {index + 1} / {cards.length}
            </span>
            <button
              onClick={() => onIndex(Math.min(cards.length - 1, index + 1))}
              disabled={index === cards.length - 1}
              className="grid size-14 place-items-center rounded-full bg-sunk disabled:opacity-30"
              aria-label="Next card"
            >
              <CaretRight size={24} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
