'use client';
import { useState } from 'react';
import { CaretRight, Storefront } from '@phosphor-icons/react';
import { CardViewer, type Card } from './StaffCards';

interface Line {
  ja: string;
  /** How it sounds, for us. */
  say: string;
  en: string;
}

interface Exchange {
  id: string;
  topic: string;
  /** What the cashier says (the common ways of asking). */
  they: Line[];
  /** What we can answer. Empty when there's nothing to say back. */
  replies: Line[];
  note?: string;
}

const YES: Line = { ja: 'はい、お願いします。', say: 'Hai, onegai shimasu', en: 'Yes, please.' };
const NO: Line = { ja: '大丈夫です。', say: 'Daijōbu desu', en: "No thanks, I'm fine." };

const EXCHANGES: Exchange[] = [
  {
    id: 'bag',
    topic: 'Do you need a bag?',
    they: [
      { ja: '袋はご利用ですか？', say: 'Fukuro wa go-riyō desu ka?', en: 'Will you use a bag?' },
      { ja: '袋はいりますか？', say: 'Fukuro wa irimasu ka?', en: 'Do you need a bag?' },
      { ja: '袋お付けしますか？', say: 'Fukuro otsuke shimasu ka?', en: 'Shall I add a bag?' },
    ],
    replies: [
      { ja: '一枚お願いします。', say: 'Ichimai onegai shimasu', en: 'One bag, please.' },
      { ja: 'いりません。', say: 'Irimasen', en: "I don't need one." },
      NO,
    ],
    note: 'Bags cost about ¥3–5.',
  },
  {
    id: 'heat',
    topic: 'Shall I heat it up?',
    they: [
      { ja: '温めますか？', say: 'Atatamemasu ka?', en: 'Shall I heat it up?' },
      { ja: '温めはいかがですか？', say: 'Atatame wa ikaga desu ka?', en: 'Would you like it heated?' },
    ],
    replies: [YES, NO],
    note: 'For bento, onigiri with fillings and frozen food. Then they may say 少々お待ちください (shōshō omachi kudasai): please wait a moment.',
  },
  {
    id: 'chopsticks',
    topic: 'Chopsticks or a spoon?',
    they: [
      { ja: 'お箸はお付けしますか？', say: 'O-hashi wa otsuke shimasu ka?', en: 'Shall I add chopsticks?' },
      { ja: 'スプーンはお付けしますか？', say: 'Supūn wa otsuke shimasu ka?', en: 'Shall I add a spoon?' },
    ],
    replies: [
      { ja: '二つお願いします。', say: 'Futatsu onegai shimasu', en: 'Two, please.' },
      { ja: '一つお願いします。', say: 'Hitotsu onegai shimasu', en: 'One, please.' },
      NO,
    ],
  },
  {
    id: 'split',
    topic: 'Separate hot and cold?',
    they: [{ ja: '袋はお分けしますか？', say: 'Fukuro wa owake shimasu ka?', en: 'Shall I bag them separately?' }],
    replies: [
      { ja: '一緒で大丈夫です。', say: 'Issho de daijōbu desu', en: 'Together is fine.' },
      { ja: '分けてください。', say: 'Wakete kudasai', en: 'Separately, please.' },
    ],
  },
  {
    id: 'eatin',
    topic: 'Eating here?',
    they: [{ ja: '店内でお召し上がりですか？', say: 'Tennai de o-meshiagari desu ka?', en: 'Will you eat it here?' }],
    replies: [
      { ja: '持ち帰りです。', say: 'Mochikaeri desu', en: "It's to take away." },
      { ja: 'ここで食べます。', say: 'Koko de tabemasu', en: "We'll eat here." },
    ],
    note: 'Eating in costs a little more tax (10% instead of 8%).',
  },
  {
    id: 'points',
    topic: 'Do you have a point card?',
    they: [{ ja: 'ポイントカードはお持ちですか？', say: 'Pointo kādo wa omochi desu ka?', en: 'Do you have a point card?' }],
    replies: [{ ja: '持っていません。', say: 'Motte imasen', en: "I don't have one." }],
    note: 'A quick shake of the head works too.',
  },
  {
    id: 'pay',
    topic: 'How will you pay?',
    they: [{ ja: 'お支払い方法は？', say: 'O-shiharai hōhō wa?', en: 'How will you pay?' }],
    replies: [
      { ja: 'カードで。', say: 'Kādo de', en: 'By card.' },
      { ja: '現金で。', say: 'Genkin de', en: 'Cash.' },
      { ja: 'Suicaで。', say: 'Suika de', en: 'With the IC card (Suica / ICOCA).' },
    ],
    note: 'Often you pay at the machine facing you; the screen shows the options.',
  },
  {
    id: 'receipt',
    topic: 'Receipt?',
    they: [{ ja: 'レシートはご利用ですか？', say: 'Reshīto wa go-riyō desu ka?', en: 'Do you want the receipt?' }],
    replies: [
      { ja: 'ください。', say: 'Kudasai', en: 'Yes, please.' },
      { ja: 'いりません。', say: 'Irimasen', en: "I don't need it." },
    ],
    note: 'Keep receipts for tax-free and for logging spend in the app.',
  },
  {
    id: 'age',
    topic: 'Buying alcohol',
    they: [
      {
        ja: '画面のタッチをお願いします。',
        say: 'Gamen no tatchi o onegai shimasu',
        en: 'Please tap the screen (to confirm you are 20+).',
      },
    ],
    replies: [],
  },
];

/** The reply cards, in order, so the full-screen viewer can swipe through one topic's answers. */
const replyCards = (x: Exchange): Card[] =>
  x.replies.map((r, i) => ({ id: `${x.id}-${i}`, ja: r.ja, en: r.en, say: r.say, kind: 'phrase' }));

/** What konbini cashiers ask and how to answer: recognise the question, tap an answer to show it. */
export function KonbiniGuide() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ cards: Card[]; index: number } | null>(null);

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Storefront size={22} className="text-accent-text" />
          At the konbini
        </h2>
        <p className="mt-1 text-sm text-ink-faint">What the cashier asks, and what to answer. Tap an answer to show it.</p>
      </div>
      <ul className="grid gap-2">
        {EXCHANGES.map((x) => {
          const open = openId === x.id;
          return (
            <li key={x.id} className="rounded-2xl border border-line bg-card">
              <button
                onClick={() => setOpenId(open ? null : x.id)}
                aria-expanded={open}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                  <span className="text-[15px] font-medium">{x.topic}</span>
                  <span lang="ja" className="text-sm text-ink-faint">
                    {x.they[0].ja}
                  </span>
                </span>
                <CaretRight size={18} className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`} />
              </button>
              {open && (
                <div className="grid gap-4 px-4 pb-4">
                  <div className="grid gap-2">
                    <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">They say</p>
                    {x.they.map((l) => (
                      <div key={l.ja} className="grid gap-0.5">
                        <p lang="ja" className="text-lg leading-snug font-semibold">
                          {l.ja}
                        </p>
                        <p className="text-sm text-ink-soft">
                          <span className="italic">{l.say}</span> · {l.en}
                        </p>
                      </div>
                    ))}
                  </div>
                  {x.replies.length > 0 && (
                    <div className="grid gap-2">
                      <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">You answer</p>
                      <div className="grid gap-2">
                        {x.replies.map((r, i) => (
                          <button
                            key={r.ja}
                            onClick={() => setViewing({ cards: replyCards(x), index: i })}
                            className="grid gap-0.5 rounded-xl bg-sunk px-3 py-2.5 text-left active:scale-[0.99]"
                          >
                            <span lang="ja" className="text-[17px] font-semibold">
                              {r.ja}
                            </span>
                            <span className="text-sm text-ink-soft">
                              <span className="italic">{r.say}</span> · {r.en}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {x.note && <p className="text-sm leading-relaxed text-ink-faint">{x.note}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <CardViewer
        cards={viewing?.cards ?? []}
        index={viewing?.index ?? null}
        onIndex={(i) => setViewing((v) => (v && i !== null ? { ...v, index: i } : null))}
      />
    </section>
  );
}
