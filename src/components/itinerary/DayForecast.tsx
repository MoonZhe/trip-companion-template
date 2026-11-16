'use client';
import { TRIP } from '@/trip.config';
import type { Day } from '@/lib/sheet/types';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { cityOf } from '@/lib/trip/city';
import { forecastFrom, slotRain, useForecast, weatherLabel } from '@/lib/trip/weather';
import { tokyoClock } from '@/lib/time/now';

const HOURS = [8, 10, 12, 14, 16, 18, 20, 22];

/** "9 Oct": the day and month, read in Japan time. */
function dayMonth(iso: string): string {
  return new Date(`${iso}T12:00:00${TRIP.utcOffset}`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TRIP.timeZone });
}

/** "18° / 12° · 40%" with an icon, for the Today header. Taps down to the full weather card. */
export function WeatherSummary({ day }: { day: Day }) {
  const forecast = useForecast();
  const w = forecast.days[`${cityOf(day.city).key}:${day.isoDate}`];
  if (!w) return null;
  return (
    <a
      href="#forecast"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById('forecast')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
      aria-label={`${weatherLabel(w.code)}, ${w.max}° high, ${w.min}° low, rain up to ${w.rain}%. Show the hourly forecast`}
      className="tabular -my-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-ink-soft"
    >
      <span className="text-accent-text">
        <WeatherIcon w={w} size={18} />
      </span>
      {w.max}°<span className="text-ink-faint">/{w.min}°</span>
      {w.rain >= 20 && <span className={w.rain >= 50 ? 'font-semibold text-accent-text' : ''}>· {w.rain}%</span>}
    </a>
  );
}

/** The day's weather card: summary, sunrise and sunset, and a strip of hourly temperatures. */
export function DayForecast({ day }: { day: Day }) {
  const forecast = useForecast();
  const today = tokyoClock();
  const city = cityOf(day.city).key;
  const w = forecast.days[`${city}:${day.isoDate}`];

  if (!w) {
    // Nothing for this day (yet, or the past fetch failed). Future days say when it will appear.
    const from = forecastFrom(day.isoDate);
    if (day.isoDate <= today.isoDate || from <= today.isoDate) return null;
    return <p className="text-sm text-ink-faint">Forecast shows up from {dayMonth(from)}</p>;
  }

  const isToday = day.isoDate === today.isoDate;
  // A day gone by shows how it was: rain that fell, not the chance of it.
  const isPast = day.isoDate < today.isoDate;
  const nowHour = Number(today.hhmm.slice(0, 2));

  return (
    <section id="forecast" className="grid gap-3 rounded-2xl border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-accent-text">
            <WeatherIcon w={w} size={22} />
          </span>
          <span className="truncate text-[15px] font-medium">
            {isPast && <span className="font-normal text-ink-faint">How it was · </span>}
            {weatherLabel(w.code)}
          </span>
        </div>
        <span className="tabular shrink-0 text-[15px] font-semibold">
          {w.max}°<span className="font-normal text-ink-faint"> / {w.min}°</span>
        </span>
      </div>

      <p className="tabular text-xs text-ink-faint">
        {isPast && w.mm != null ? (w.mm >= 0.5 ? `Rain: ${Math.round(w.mm)} mm` : 'No rain') : `Rain: up to ${w.rain}%`} · Sunrise {w.sunrise} · Sunset {w.sunset}
      </p>

      <div className="grid grid-cols-8 gap-0.5">
        {HOURS.map((h) => {
          const hw = forecast.hours[`${city}:${day.isoDate}T${String(h).padStart(2, '0')}`];
          // Each slot covers two hours, so a peak at 21:00 still shows under 20.
          const rain = slotRain(forecast.hours, city, day.isoDate, h) ?? 0;
          const next = forecast.hours[`${city}:${day.isoDate}T${String(h + 1).padStart(2, '0')}`];
          const fell = (hw?.mm ?? 0) + (next?.mm ?? 0);
          const current = isToday && nowHour >= h && nowHour < h + 2;
          return (
            <div
              key={h}
              className={`grid min-w-0 justify-items-center gap-1 rounded-lg py-1.5 ${current ? 'bg-accent-soft' : ''}`}
            >
              <span className="text-xs leading-none text-ink-faint">{h}</span>
              {hw ? (
                <>
                  <span className="text-accent-text">
                    <WeatherIcon w={hw} size={16} />
                  </span>
                  <span className="tabular text-xs leading-none">{hw.temp}°</span>
                  {isPast ? (
                    <span className="tabular h-3 text-xs leading-none text-ink-faint">
                      {fell >= 0.5 ? `${Math.round(fell)}mm` : ''}
                    </span>
                  ) : (
                    <span
                      className={`tabular h-3 text-xs leading-none ${
                        rain >= 50 ? 'font-semibold text-accent-text' : 'text-ink-faint'
                      }`}
                    >
                      {rain >= 20 ? `${rain}%` : ''}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-ink-faint">–</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
