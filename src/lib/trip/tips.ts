export interface TipPoint {
  /** Leading emoji (e.g. ⭐ 💡 ⚠️ 🔄 🧾 🚃), or null for a plain line. */
  icon: string | null;
  text: string;
}

export interface Tips {
  /** First line of the cell: the one-line summary of the stop. */
  lead: string;
  points: TipPoint[];
}

// An emoji (with optional variation selector / skin tone / ZWJ sequence) or a bullet at the start of a line.
const LEADING_ICON = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*|[•·-])\s*/u;

/**
 * The sheet's "Highlights & Tips" cells are written as a summary line followed by one point per
 * line, each starting with an icon. Older single-paragraph cells still work: they become the lead.
 */
export function parseTips(text: string): Tips {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const [lead = '', ...rest] = lines;
  const points = rest.map((line) => {
    const m = line.match(LEADING_ICON);
    if (!m) return { icon: null, text: line };
    const icon = /^[•·-]$/.test(m[1]) ? null : m[1];
    return { icon, text: line.slice(m[0].length) };
  });
  return { lead, points };
}

const PIN = /^📍\s*/u;
const URL_ONLY = /^https?:\/\/\S+$/;

/**
 * The exact place a stop's "📍" tips line names, e.g. "📍 3COINS Namba CITY, Osaka" or a Google
 * Maps link. Directions, the map pin, hours and the nearest station all use it over the title.
 */
export function pinOf(tips: string): { text: string; url: string | null } | null {
  const line = tips
    .split('\n')
    .map((l) => l.trim())
    .find((l) => PIN.test(l));
  const text = line?.replace(PIN, '').trim();
  if (!text) return null;
  return { text, url: URL_ONLY.test(text) ? text : null };
}

/** The pin's search words with the country added, or null when there's no 📍 line (or it's only a link). */
export function pinQuery(tips: string): string | null {
  const pin = pinOf(tips);
  if (!pin || pin.url) return null;
  return /\bjapan\b/i.test(pin.text) ? pin.text : `${pin.text}, Japan`;
}
