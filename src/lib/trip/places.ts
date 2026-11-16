import type { Stop } from '@/lib/sheet/types';
import { cityOf } from './city';
import { pinQuery } from './tips';

const MEAL = /^(\[option [a-z]\]|early dinner|final \w+ dinner|breakfast|lunch|dinner)\s*:?\s*/i;
const LEADING_VERB = /^(✈\s*)?(arrive|depart|head to|back to|return to)\s+/i;
const TRAILING_FLUFF = /\s+(walk|evening explore|explore|area|spectacle|food crawl|tech shopping)$/i;
const VAGUE =
  /^(|\+.*|near\b.*|in\b.*|at\b.*|around\b.*|more shopping|last minute shopping|okonomiyaki|yakiniku( bbq)?|shirasu rice bowl|sushi|ramen)$/i;
const NOT_A_PLACE = /check-?in|checkout|luggage|drop bags/i;

/** Emoji and other pictographs that confuse place search ("♨️", "🎃", "✈"). */
const stripSymbols = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').trim();

/**
 * A place-search query for a stop: its "📍" tips line when it has one, else words from the title.
 * Null when the stop isn't a specific place (transport legs, hotel logistics, "Breakfast", "Dinner near Umeda").
 */
export function placeQuery(stop: Pick<Stop, 'title' | 'category'> & { tips?: string }, dayCity: string): string | null {
  // Hotel stops share the hotel's own pin on the map; their 📍 is only for directions.
  if (/hotel/i.test(stop.category)) return null;
  const pinned = stop.tips ? pinQuery(stop.tips) : null;
  if (pinned) return pinned;
  if (/transport/i.test(stop.category)) return null;
  if (NOT_A_PLACE.test(stop.title)) return null;

  let q = stop.title.replace(MEAL, '').replace(LEADING_VERB, '');
  q = stripSymbols(q);
  if (q.includes('→')) q = q.split('→')[0]; // a walk: pin where it starts
  q = q
    .replace(/\(.*?\)/g, '')
    .replace(/\s+\+.*$/, '')
    .replace(/[!]/g, '')
    .replace(':', '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_FLUFF, '')
    .trim();

  if (VAGUE.test(q)) return null;
  return `${q}, ${cityOf(dayCity).name}, Japan`;
}
