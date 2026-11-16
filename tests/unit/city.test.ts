import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/sheet.json';
import { parseTrip } from '@/lib/sheet/parse';
import type { RawSheet } from '@/lib/sheet/types';
import { cityForStop, cityOf, directionsUrl, hotelFor, placeName } from '@/lib/trip/city';

const trip = parseTrip(fixture as RawSheet);

describe('cityOf', () => {
  it('uses the destination on travel days', () => {
    expect(cityOf('OSAKA → KYOTO').name).toBe('Kyoto');
    expect(cityOf('TOKYO → DEPARTURE').name).toBe('Tokyo');
    expect(cityOf('NARA DAY TRIP').name).toBe('Nara');
    expect(cityOf('KAMAKURA DAY TRIP').name).toBe('Kamakura');
  });
});

describe('hotelFor', () => {
  const names = trip.days.map((_, i) => hotelFor(trip.days, i, trip.hotels)?.city ?? null);
  it('tracks the hotel through day trips and ends on departure day', () => {
    expect(names).toEqual(['OSAKA', 'OSAKA', 'OSAKA', 'KYOTO', 'KYOTO', 'KYOTO', 'TOKYO', 'TOKYO', 'TOKYO', null]);
  });
});

describe('directionsUrl', () => {
  it('strips meal prefixes and uses the arrival point', () => {
    const lunch = trip.days[1].stops.find((s) => s.title.startsWith('Lunch'))!;
    expect(decodeURIComponent(directionsUrl(lunch, trip.days[1].city))).toContain(
      'destination=Oretachi no Curry Ya, Osaka, Japan',
    );
    const train = trip.days[5].stops.find((s) => s.title.startsWith('Train: Kyoto'))!;
    expect(decodeURIComponent(directionsUrl(train, trip.days[5].city))).toContain('destination=Nara, Nara, Japan');
  });
});

describe('placeName', () => {
  const named = (title: string) => placeName({ ...trip.days[0].stops[0], title });
  it('never comes out blank or starting with "+"', () => {
    expect(named('Breakfast + Hotel Checkout')).toBe('Breakfast');
    expect(named('Lunch (bags stored at hotel)')).toBe('Lunch');
    expect(named('Final Kyoto Dinner')).toBe('Final Kyoto Dinner');
  });
  it('still cuts asides, prefixes and the second of "A + B"', () => {
    expect(named('Lunch: Chitose (nikusui) + 3COINS Namba')).toBe('Chitose');
    expect(named('Kiyomizu-dera → Higashiyama → Gion')).toBe('Gion');
    expect(named('Metro + JR: Nagata → Kyoto')).toBe('Kyoto');
  });
});

describe('cityForStop', () => {
  const city = (d: number, start: string) => {
    const day = trip.days[d - 1];
    return cityOf(
      cityForStop(
        day,
        day.stops.find((s) => s.title.startsWith(start))!,
      ),
    ).name;
  };
  it('keeps stops before the move in the city we are leaving', () => {
    expect(city(7, 'Breakfast')).toBe('Kyoto');
    expect(city(7, 'JR Kameoka')).toBe('Kyoto');
    expect(city(7, 'Shinkansen')).toBe('Tokyo');
    expect(city(7, 'Asakusa')).toBe('Tokyo');
    expect(city(4, 'Breakfast')).toBe('Osaka');
    expect(city(4, 'Metro + JR')).toBe('Kyoto');
    expect(city(4, 'Fushimi')).toBe('Kyoto');
  });
  it('leaves one-city days and departure day alone', () => {
    expect(city(5, 'Breakfast')).toBe('Kyoto');
    expect(city(10, 'Breakfast')).toBe('Tokyo');
  });
});

describe('directionsUrl with a 📍 line', () => {
  const stop = trip.days[1].stops.find((s) => s.title.startsWith('Lunch'))!;
  it('goes to the pinned place', () => {
    const pinned = { ...stop, tips: `${stop.tips}\n📍 3COINS Namba CITY, Osaka` };
    expect(decodeURIComponent(directionsUrl(pinned, trip.days[1].city))).toContain('destination=3COINS Namba CITY, Osaka, Japan');
  });
  it('opens a pinned Maps link as is', () => {
    const linked = { ...stop, tips: 'x\n📍 https://maps.app.goo.gl/abc123' };
    expect(directionsUrl(linked, trip.days[1].city)).toBe('https://maps.app.goo.gl/abc123');
  });
});
