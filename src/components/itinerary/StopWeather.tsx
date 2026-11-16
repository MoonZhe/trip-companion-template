'use client';
import { Umbrella } from '@phosphor-icons/react';
import type { Stop } from '@/lib/sheet/types';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { cityOf } from '@/lib/trip/city';
import { parseMinutes } from '@/lib/trip/travel';
import { stopWeather, useForecast } from '@/lib/trip/weather';

/** Temperature and rain chance for a stop, shown inline on its row. Renders nothing without a forecast. */
export function StopWeather({ stop, dayCity, isoDate }: { stop: Stop; dayCity: string; isoDate: string }) {
  const forecast = useForecast();
  const w = stopWeather(forecast, cityOf(dayCity).key, isoDate, stop.time, parseMinutes(stop.duration));
  if (!w) return null;

  const label = `${w.temp}°, ${w.rain}% chance of rain`;
  return (
    <span
      role="img"
      aria-label={label}
      className={`tabular inline-flex items-center gap-1 text-sm ${w.rain >= 60 ? 'font-semibold text-accent-text' : ''}`}
    >
      <WeatherIcon w={w} size={13} />
      {w.temp}°
      {w.rain >= 40 && (
        <span className="inline-flex items-center gap-0.5">
          <Umbrella size={13} weight="fill" aria-hidden />
          {w.rain}%
        </span>
      )}
    </span>
  );
}
