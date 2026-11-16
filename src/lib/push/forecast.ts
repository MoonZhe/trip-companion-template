import 'server-only';
import { TRIP } from '@/trip.config';
import type { BriefWeather } from './brief';

/** Forecast point per city, from the trip config. */
const SPOTS: Record<string, readonly [number, number]> = Object.fromEntries(TRIP.cities.map((c) => [c.key, c.spot]));

const RAINY = 50;

/** A city's forecast for one date (Tokyo time). Null if it's out of range or the request fails. */
export async function forecastFor(cityKey: string, isoDate: string): Promise<BriefWeather | null> {
  const spot = SPOTS[cityKey];
  if (!spot) return null;
  const params = new URLSearchParams({
    latitude: String(spot[0]),
    longitude: String(spot[1]),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    hourly: 'weather_code,temperature_2m,precipitation_probability',
    timezone: TRIP.timeZone,
    start_date: isoDate,
    end_date: isoDate,
  });
  try {
    // A stalled request would hold the cron until the platform kills it; on timeout the brief goes out without weather.
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const { daily: d, hourly: h } = await res.json();
    if (!d?.time?.length) return null;
    const times: string[] = h?.time ?? [];
    const at = (hour: number) => times.indexOf(`${isoDate}T${String(hour).padStart(2, '0')}:00`);
    let rainFrom: number | null = null;
    for (let hour = 8; hour <= 22 && rainFrom === null; hour++) {
      const i = at(hour);
      if (i !== -1 && (h.precipitation_probability[i] ?? 0) >= RAINY) rainFrom = hour;
    }
    // Like the app's day icon: the highest code from 08:00 to midnight, so dawn fog doesn't count.
    let code: number | null = null;
    for (let hour = 8; hour <= 23; hour++) {
      const i = at(hour);
      const c = i === -1 ? undefined : h.weather_code?.[i];
      if (typeof c === 'number' && (code === null || c > code)) code = c;
    }
    const nine = at(9);
    return {
      code: code ?? d.weather_code[0],
      max: Math.round(d.temperature_2m_max[0]),
      min: Math.round(d.temperature_2m_min[0]),
      rain: d.precipitation_probability_max[0] ?? 0,
      rainFrom,
      morning: nine === -1 ? null : Math.round(h.temperature_2m[nine]),
    };
  } catch {
    return null;
  }
}
