import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/sheet.json';
import { parseTrip } from '@/lib/sheet/parse';
import type { RawSheet } from '@/lib/sheet/types';
import { placeQuery } from '@/lib/trip/places';

const trip = parseTrip(fixture as RawSheet);
const q = (title: string, category = '🏛 Culture', city = 'OSAKA') => placeQuery({ title, category }, city);

describe('placeQuery', () => {
  it('turns stop titles into searchable places', () => {
    expect(q('Lunch: Chitose (nikusui) + 3COINS Namba', '🍜 Food')).toBe('Chitose, Osaka, Japan');
    expect(q('Arrive Osaka KIX', '✈ Arrival')).toBe('Osaka KIX, Osaka, Japan');
    expect(q('Arashiyama: Bamboo Grove', '🌿 Nature', 'KYOTO')).toBe('Arashiyama Bamboo Grove, Kyoto, Japan');
    expect(q('♨️ Yunohana Onsen (Kameoka)', '♨️ Relax', 'KYOTO')).toBe('Yunohana Onsen, Kyoto, Japan');
    expect(q('Kiyomizu-dera → Higashiyama → Gion', '🏛 Culture', 'OSAKA → KYOTO')).toBe('Kiyomizu-dera, Kyoto, Japan');
    expect(q('Akihabara Tech Shopping 🖥️ (½ day)', '🛍 Tech/Shopping', 'TOKYO')).toBe('Akihabara, Tokyo, Japan');
    expect(q('Breakfast: Tsukiji Outer Market', '🍜 Food', 'TOKYO → DEPARTURE')).toBe('Tsukiji Outer Market, Tokyo, Japan');
    expect(q('✈ DEPART Tokyo Haneda', '✈ Departure', 'TOKYO')).toBe('Tokyo Haneda, Tokyo, Japan');
  });

  it('skips stops that are not a specific place', () => {
    for (const [title, cat] of [
      ['Breakfast', '🍜 Food'],
      ['Breakfast + Hotel Checkout', '🍜 Food'],
      ['Lunch near Sumiyoshi', '🍜 Food'],
      ['Dinner in Kameoka', '🍜 Food'],
      ['Final Kyoto Dinner', '🍜 Food'],
      ['Dinner: Okonomiyaki', '🍜 Food'],
      ['Train: Kyoto → Nara', '🚃 Transport'],
      ['Kyoto Station: Store Luggage', '🏨 Hotel'],
      ['Airport: Check-in & Duty Free', '✈ Departure'],
      ['Lunch (bags stored at hotel)', '🍜 Food'],
      ['Last Minute Shopping', '🛍 Shopping'],
    ]) {
      expect(q(title, cat), title).toBeNull();
    }
  });

  it('pins most sightseeing stops on the real itinerary', () => {
    const stops = trip.days.flatMap((d) => d.stops.filter((s) => !s.isOption).map((s) => placeQuery(s, d.city)));
    const pinned = stops.filter(Boolean).length;
    expect(pinned).toBeGreaterThan(35);
    expect(new Set(stops.filter(Boolean)).size).toBe(pinned);
  });
});

describe('placeQuery with a 📍 line', () => {
  it('uses the pin over the title, even for transport stops', () => {
    expect(placeQuery({ title: '3COINS + Dotonbori', category: '🛍 Shopping', tips: 'x\n📍 3COINS Namba CITY, Osaka' }, 'OSAKA')).toBe(
      '3COINS Namba CITY, Osaka, Japan',
    );
    expect(placeQuery({ title: 'Metro → Hotel', category: '🚃 Transport', tips: 'x\n📍 Namba Station, Osaka' }, 'OSAKA')).toBe(
      'Namba Station, Osaka, Japan',
    );
  });
});
