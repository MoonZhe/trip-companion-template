import { TRIP } from '@/trip.config';
import type { Day, Hotel, Stop } from '@/lib/sheet/types';
import { pinOf, pinQuery } from './tips';

const CITIES = TRIP.cities;
const FALLBACK = CITIES.find((c) => c.key === TRIP.fallbackCity) ?? CITIES[0];

/** "OSAKA → KYOTO" is a Kyoto day; "TOKYO → DEPARTURE" stays Tokyo. */
export function cityOf(dayCity: string): (typeof CITIES)[number] {
  const parts = dayCity
    .toUpperCase()
    .split('→')
    .map((p) => p.trim());
  for (const part of [...parts].reverse()) {
    const hit = CITIES.find((c) => part.includes(c.key));
    if (hit) return hit;
  }
  return FALLBACK;
}

/**
 * The city a stop is in, as a day-city string for `cityOf`. On an "A → B" day the stops before the
 * one that heads to B (its title names B) are still in A: breakfast in Kameoka on "KYOTO → TOKYO".
 */
export function cityForStop(day: Day, stop: Stop): string {
  const from = day.city.toUpperCase().split('→')[0].trim();
  const to = cityOf(day.city);
  const origin = CITIES.find((c) => from.includes(c.key));
  if (!day.city.includes('→') || !origin || origin.key === to.key) return day.city;
  const move = day.stops.findIndex((s) => s.title.toUpperCase().includes(to.key));
  const i = day.stops.findIndex((s) => s.key === stop.key);
  return move > 0 && i >= 0 && i < move ? origin.key : day.city;
}

/** Where we sleep tonight: follows the hotel cities, keeps the last one on day trips. */
export function hotelFor(days: Day[], index: number, hotels: Hotel[]): Hotel | null {
  if (/DEPART/i.test(days[index]?.city ?? '')) return null;
  let current: Hotel | null = null;
  for (let i = 0; i <= index && i < days.length; i++) {
    const parts = days[i].city
      .toUpperCase()
      .split('→')
      .map((p) => p.trim());
    for (const part of parts) {
      const h = hotels.find((x) => x.city && part.includes(x.city));
      if (h) current = h;
    }
  }
  return current;
}

const PREFIX = /^(\[option [a-z]\]|lunch|dinner|breakfast|early dinner|final kyoto dinner)\s*[:\-]?\s*/i;

/** Google Maps transit directions from wherever we are (no taxis on this trip). */
const transitTo = (destination: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`;

/**
 * A stop's place name: no asides, the arrival point of "A → B", the first of "A + B", no meal
 * prefix. A title that is only a meal ("Lunch (bags stored at hotel)", "Breakfast + Hotel
 * Checkout") keeps the meal word rather than going blank.
 */
export function placeName(stop: Stop): string {
  let place = stop.title.replace(/\(.*?\)/g, '').trim();
  if (place.includes('→')) place = place.split('→').pop()!.trim();
  place = place.replace(/\s*\+.*$/, '').trim();
  return place.replace(PREFIX, '').trim() || place;
}

/**
 * Transit directions to a stop: to its "📍" place when the sheet names one (a Maps link opens that
 * place), else a search from the title that usually lands on the right place.
 */
export function directionsUrl(stop: Stop, dayCity: string): string {
  const pin = pinOf(stop.tips ?? '');
  if (pin?.url) return pin.url;
  const pinned = pinQuery(stop.tips ?? '');
  return transitTo(pinned ?? `${placeName(stop)}, ${cityOf(dayCity).name}, Japan`);
}

export function hotelDirectionsUrl(h: Hotel): string {
  return transitTo(`${h.name}, Japan`);
}

export function hotelMapsUrl(h: Hotel): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, Japan`)}`;
}
