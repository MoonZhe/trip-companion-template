/**
 * The trip, in one place. Change this file first when pointing the app at a different trip.
 * What is NOT here yet (currency, the Japan-only helpers) is listed in AGENTS.md → "Changing the destination".
 *
 * Also change by hand, since they can't import this file: public/manifest.webmanifest (name,
 * description), the fallback title in public/sw.js, and the cron times in vercel.json (UTC).
 */
export const TRIP = {
  /** App title, Home Screen name, headers. */
  name: 'Japan 2026',
  /** Shown on the login page and Today header. */
  travellers: 'Alex & Sam',
  /** One line under the title on the login page. */
  tagline: 'Osaka, Kyoto, Nara, Tokyo, Kamakura. 24 Oct to 2 Nov.',

  /** IANA timezone of the destination. Every clock in the app runs on it, whatever the phone says. */
  timeZone: 'Asia/Tokyo',
  /** The same timezone as a fixed offset, for building dates. Destinations with daylight saving need more than this. */
  utcOffset: '+09:00',
  /** The sheet's day headers carry "24 Oct" without a year. A trip over New Year needs `isoFromLabel` in parse.ts changed. */
  year: 2026,
  /** First day of the trip (weather history is kept back to it). */
  startDate: '2026-10-24',

  /**
   * Cities as they appear in the sheet's "DAY n · date · CITY" headers (upper case, matched by
   * substring). `accent` tints that city's days; `spot` is where its weather forecast is taken.
   * A city missing here still works: it gets the fallback city's colour and no weather.
   */
  cities: [
    { key: 'KAMAKURA', name: 'Kamakura', accent: '#2B6650', spot: [35.32, 139.55] },
    { key: 'NARA', name: 'Nara', accent: '#86581A', spot: [34.685, 135.805] },
    { key: 'KYOTO', name: 'Kyoto', accent: '#6B3A6E', spot: [35.01, 135.77] },
    { key: 'TOKYO', name: 'Tokyo', accent: '#2D4563', spot: [35.69, 139.77] },
    { key: 'OSAKA', name: 'Osaka', accent: '#B23A1C', spot: [34.69, 135.5] },
  ],
  /** Used when a day's city isn't in the list. */
  fallbackCity: 'TOKYO',
} as const;

export type CityKey = (typeof TRIP.cities)[number]['key'];
