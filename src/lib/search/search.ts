/**
 * Search across the trip. Case, accents, full-width letters and katakana vs hiragana don't matter.
 * Every word typed has to appear somewhere in the item; hits in the first field (the title) rank higher.
 */

/** One character folded for matching: NFKC, lower case, no Latin accents, katakana as hiragana. */
function foldChar(ch: string): string {
  return ch
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ァ-ヶ]/g, (k) => String.fromCharCode(k.charCodeAt(0) - 0x60));
}

/** `text` folded, with the index in `text` that each folded character came from. */
function foldWithMap(text: string): { folded: string; from: number[] } {
  let folded = '';
  const from: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) from.push(i);
    i += ch.length;
  }
  return { folded, from };
}

export const fold = (s: string) => foldWithMap(s).folded;

/** The words of a query, folded. Empty when there's nothing worth searching for yet. */
export function terms(query: string): string[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  // One Latin letter matches nearly everything; one Japanese character is a real word.
  if (words.length === 1 && words[0].length < 2 && !/[^\x00-\x7f]/.test(words[0])) return [];
  return words;
}

export interface Snippet {
  before: string;
  hit: string;
  after: string;
}

export interface Hit<T> {
  item: T;
  score: number;
  /** Where the first word was found, when that's not the title (which is shown anyway). */
  snippet: Snippet | null;
}

/** The line of `text` around a match, cut to about `room` characters each side. */
function snippetOf(text: string, start: number, end: number, room = 40): Snippet {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const lineEnd = nl === -1 ? text.length : nl;
  const from = Math.max(lineStart, start - room);
  const to = Math.min(lineEnd, end + room);
  return {
    before: (from > lineStart ? '…' : '') + text.slice(from, start),
    hit: text.slice(start, end),
    after: text.slice(end, to) + (to < lineEnd ? '…' : ''),
  };
}

/**
 * The items matching `query`, best first (ties keep their order). `fieldsOf` gives an item's text,
 * title first.
 */
export function search<T>(items: T[], query: string, fieldsOf: (item: T) => (string | null | undefined)[]): Hit<T>[] {
  const words = terms(query);
  if (!words.length) return [];
  const hits: (Hit<T> & { order: number })[] = [];
  items.forEach((item, order) => {
    const fields = fieldsOf(item).map((f) => f ?? '');
    const folded = fields.map(foldWithMap);
    let score = 0;
    let snippet: Snippet | null = null;
    for (const [w, word] of words.entries()) {
      const at = folded.findIndex((f) => f.folded.includes(word));
      if (at === -1) return;
      const f = folded[at];
      const pos = f.folded.indexOf(word);
      score += at === 0 ? (pos === 0 ? 4 : 3) : 1;
      if (w === 0 && at > 0) {
        const start = f.from[pos];
        const last = f.from[pos + word.length - 1];
        const end = last + (fields[at].codePointAt(last)! > 0xffff ? 2 : 1);
        snippet = snippetOf(fields[at], start, end);
      }
    }
    hits.push({ item, score, snippet, order });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order).map(({ item, score, snippet }) => ({ item, score, snippet }));
}
