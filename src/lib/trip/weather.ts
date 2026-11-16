'use client';
import { TRIP, type CityKey } from '@/trip.config';
import { useEffect, useSyncExternalStore } from 'react';
import { readCached, writeCached } from '@/lib/offline/store';

export interface DayWeather {
  code: number;
  max: number;
  min: number;
  rain: number;
  /** "06:09" */
  sunrise: string;
  /** "17:12" */
  sunset: string;
  /** Rain that actually fell (or is forecast), in mm. Missing in copies cached before it was added. */
  mm?: number;
}

export interface HourWeather {
  code: number;
  temp: number;
  rain: number;
  mm?: number;
}

export interface Forecast {
  /** Key: `${city}:${isoDate}` */
  days: Record<string, DayWeather>;
  /** Key: `${city}:${isoDate}T${HH}` */
  hours: Record<string, HourWeather>;
}

/** Where each city's forecast is taken (Kyoto nights are in Kameoka, but days are in the city). */
const SPOTS = Object.fromEntries(TRIP.cities.map((c) => [c.key, c.spot])) as Record<CityKey, readonly [number, number]>;

const MAX_AGE = 3 * 60 * 60 * 1000;

/** The trip's first day: past days back to it are fetched too, so the Days tab keeps how the weather was. */
const TRIP_START = TRIP.startDate;

/** Days from the trip's start to today (Japan time), within what Open-Meteo keeps (92). */
export function pastDays(today: string, start = TRIP_START): number {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  return Math.min(92, Math.max(0, days));
}
const EMPTY: Forecast = { days: {}, hours: {} };
/** Bump when the fetched data changes shape (2: past days and mm), so phones refetch at once. */
const SHAPE = 2;

/** WMO weather code → a short label, used for the icon and screen readers. */
export function weatherKind(code: number): 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' {
  if (code === 0 || code === 1) return 'sun';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

/** Finer WMO label: "Light rain", "Heavy showers" and so on. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing drizzle';
  if (code === 61) return 'Light rain';
  if (code === 63) return 'Rain';
  if (code === 65) return 'Heavy rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code === 80) return 'Light showers';
  if (code === 81) return 'Showers';
  if (code === 82) return 'Heavy showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Mixed';
}

/** The hours the day card covers: 08:00 to midnight (we're asleep before that). */
export const DAY_HOURS = { from: 8, to: 23 } as const;

const hourKey = (city: string, iso: string, h: number) => `${city}:${iso}T${String(h).padStart(2, '0')}`;

/** Highest hourly chance of rain between 08:00 and midnight, or null when there's no hourly forecast. */
export function daytimeRain(hours: Forecast['hours'], city: string, iso: string): number | null {
  let max: number | null = null;
  for (let h = DAY_HOURS.from; h <= DAY_HOURS.to; h++) {
    const hw = hours[hourKey(city, iso, h)];
    if (hw && (max === null || hw.rain > max)) max = hw.rain;
  }
  return max;
}

/**
 * The day's weather code from 08:00 to midnight only, so early-morning fog doesn't label a sunny
 * day. Same rule as Open-Meteo's daily code (the highest WMO code wins), just over our hours.
 * Null when there's no hourly forecast.
 */
export function daytimeCode(hours: Forecast['hours'], city: string, iso: string): number | null {
  let max: number | null = null;
  for (let h = DAY_HOURS.from; h <= DAY_HOURS.to; h++) {
    const hw = hours[hourKey(city, iso, h)];
    if (hw && (max === null || hw.code > max)) max = hw.code;
  }
  return max;
}

/** Highest chance of rain across hour `h` and the next one: a 2-hour slot on the day card. */
export function slotRain(hours: Forecast['hours'], city: string, iso: string, h: number): number | null {
  const a = hours[hourKey(city, iso, h)];
  const b = hours[hourKey(city, iso, h + 1)];
  if (!a && !b) return null;
  return Math.max(a?.rain ?? 0, b?.rain ?? 0);
}

async function fetchForecast(): Promise<Forecast> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TRIP.timeZone });
  const keys = Object.keys(SPOTS) as CityKey[];
  const params = new URLSearchParams({
    latitude: keys.map((k) => SPOTS[k][0]).join(','),
    longitude: keys.map((k) => SPOTS[k][1]).join(','),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset',
    hourly: 'weather_code,temperature_2m,precipitation_probability,precipitation',
    timezone: TRIP.timeZone,
    forecast_days: '16',
    past_days: String(pastDays(today)),
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('weather');
  const body = await res.json();
  const list = Array.isArray(body) ? body : [body];
  const out: Forecast = { days: {}, hours: {} };
  list.forEach((loc, i) => {
    const city = keys[i];
    const d = loc.daily;
    d.time.forEach((iso: string, j: number) => {
      out.days[`${city}:${iso}`] = {
        code: d.weather_code[j],
        max: Math.round(d.temperature_2m_max[j]),
        min: Math.round(d.temperature_2m_min[j]),
        rain: d.precipitation_probability_max[j] ?? 0,
        sunrise: String(d.sunrise[j]).slice(11, 16),
        sunset: String(d.sunset[j]).slice(11, 16),
        mm: d.precipitation_sum?.[j] ?? undefined,
      };
    });
    const h = loc.hourly;
    h.time.forEach((iso: string, j: number) => {
      out.hours[`${city}:${iso.slice(0, 13)}`] = {
        code: h.weather_code[j],
        temp: Math.round(h.temperature_2m[j]),
        rain: h.precipitation_probability[j] ?? 0,
        mm: h.precipitation?.[j] ?? undefined,
      };
    });
    // The day's icon and "Rain: up to" cover the day we're out (08:00–midnight), not the small hours.
    d.time.forEach((iso: string) => {
      const day = out.days[`${city}:${iso}`];
      if (!day) return;
      const rain = daytimeRain(out.hours, city, iso);
      if (rain !== null) day.rain = rain;
      const code = daytimeCode(out.hours, city, iso);
      if (code !== null) day.code = code;
    });
  });
  return out;
}

// One shared store for the whole app, so many components don't each fetch.
let current: Forecast = EMPTY;
let fetchedAt = 0;
const subscribers = new Set<(f: Forecast) => void>();
let inFlight = false;

function publish(data: Forecast, at: number) {
  if (at < fetchedAt) return;
  current = data;
  fetchedAt = at;
  subscribers.forEach((s) => s(data));
}

/** Loads the cached forecast, then refreshes it from the network when it is older than 3 hours. */
async function ensureLoaded(): Promise<void> {
  if (inFlight) return;
  if (fetchedAt && Date.now() - fetchedAt < MAX_AGE) return;
  inFlight = true;
  try {
    const cached = await readCached<{ at: number; data: Forecast; v?: number }>('forecast');
    if (cached) publish(cached.data, cached.at);
    if (cached && cached.v === SHAPE && Date.now() - cached.at < MAX_AGE) return;
    if (!navigator.onLine) return;
    const data = await fetchForecast();
    const at = Date.now();
    await writeCached('forecast', { at, data, v: SHAPE });
    publish(data, at);
  } catch {
    // Offline or the API is down: keep whatever we already have.
  } finally {
    inFlight = false;
  }
}

const subscribe = (onChange: () => void) => {
  subscribers.add(onChange);
  return () => void subscribers.delete(onChange);
};

/** The whole forecast for the trip's cities. Re-renders when fresh data arrives. */
export function useForecast(): Forecast {
  const forecast = useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
  useEffect(() => {
    void ensureLoaded();
    // Phones keep the app open in the background for days: check again whenever it comes back.
    const onShow = () => document.visibilityState === 'visible' && void ensureLoaded();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  return forecast;
}

/**
 * Daily forecasts for the trip's cities. Forecasts only reach 16 days ahead, so days further out
 * simply have none. The last copy is kept for offline use.
 */
export function useWeather(): (cityKey: string, isoDate: string) => DayWeather | undefined {
  const forecast = useForecast();
  return (cityKey, isoDate) => forecast.days[`${cityKey}:${isoDate}`];
}

const TIME = /^(\d{1,2}):(\d{2})/;

/**
 * Weather for a stop: temperature and code from the hour it starts, and the highest chance of rain
 * across the hours it spans (capped at 4 hours and kept within the same day). Null when the time
 * isn't a clock time or the forecast doesn't cover that hour.
 */
export function stopWeather(
  f: Forecast,
  cityKey: string,
  isoDate: string,
  time: string,
  durationMin: number | null,
): { temp: number; code: number; rain: number } | null {
  const m = TIME.exec(time);
  if (!m) return null;
  const startH = Number(m[1]);
  const hourKey = (h: number) => `${cityKey}:${isoDate}T${String(h).padStart(2, '0')}`;
  const start = f.hours[hourKey(startH)];
  if (!start) return null;

  const startMin = startH * 60 + Number(m[2]);
  const span = Math.min(durationMin ?? 60, 4 * 60);
  const endH = Math.min(Math.floor((startMin + span) / 60), 23);
  let rain = start.rain;
  for (let h = startH + 1; h <= endH; h++) {
    const hour = f.hours[hourKey(h)];
    if (hour && hour.rain > rain) rain = hour.rain;
  }
  return { temp: start.temp, code: start.code, rain };
}

/** The date the forecast first exists for a day: the API reaches 15 days past today. */
export function forecastFrom(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 15);
  return d.toISOString().slice(0, 10);
}
