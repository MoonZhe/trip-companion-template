import { describe, expect, it } from 'vitest';
import { daytimeCode, daytimeRain, forecastFrom, pastDays, slotRain, stopWeather, weatherLabel, type Forecast, type HourWeather } from '@/lib/trip/weather';

const hour = (over: Partial<HourWeather> = {}): HourWeather => ({ code: 1, temp: 18, rain: 0, ...over });

const forecast = (hours: Record<string, HourWeather>): Forecast => ({ days: {}, hours });

const f = forecast({
  'OSAKA:2026-10-26T09': hour({ temp: 17, code: 61, rain: 10 }),
  'OSAKA:2026-10-26T10': hour({ temp: 16, code: 3, rain: 30 }),
  'OSAKA:2026-10-26T11': hour({ temp: 15, code: 3, rain: 70 }),
  'OSAKA:2026-10-26T12': hour({ temp: 14, code: 3, rain: 5 }),
  'OSAKA:2026-10-26T13': hour({ temp: 13, code: 3, rain: 90 }),
  'OSAKA:2026-10-26T14': hour({ temp: 12, code: 3, rain: 95 }),
  'OSAKA:2026-10-26T15': hour({ temp: 11, code: 3, rain: 99 }),
  'OSAKA:2026-10-26T16': hour({ temp: 10, code: 3, rain: 99 }),
  'OSAKA:2026-10-26T23': hour({ temp: 9, code: 3, rain: 50 }),
});

describe('stopWeather', () => {
  it('takes temperature and code from the start hour', () => {
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '10:30', 30)).toMatchObject({ temp: 16, code: 3 });
  });

  it('takes the highest rain chance across the duration', () => {
    // 10:00 for 90 min runs through the 11:00 hour (70%), not the later 90%.
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '10:00', 90)?.rain).toBe(70);
  });

  it('defaults to an hour when the duration is unknown', () => {
    // An hour from 10:00 ends at 11:00, so the 11:00 hour (70%) counts too.
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '10:00', null)?.rain).toBe(70);
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '10:00', 0)?.rain).toBe(30);
  });

  it('caps the span at four hours', () => {
    // 09:00 + 6h would reach 15:00 (99%), but the cap stops at 13:00 (90%).
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '09:00', 360)?.rain).toBe(90);
  });

  it('stays within the same date', () => {
    // 23:00 + 4h would run past midnight, so only the 23:00 hour counts.
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '23:00', 240)?.rain).toBe(50);
  });

  it('returns null for a bad time', () => {
    expect(stopWeather(f, 'OSAKA', '2026-10-26', 'Morning', 60)).toBeNull();
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '', 60)).toBeNull();
  });

  it('returns null when the start hour is not forecast', () => {
    expect(stopWeather(f, 'OSAKA', '2026-10-26', '08:00', 60)).toBeNull();
    expect(stopWeather(f, 'KYOTO', '2026-10-26', '10:00', 60)).toBeNull();
  });
});

describe('forecastFrom', () => {
  it('is 15 days before the day', () => {
    expect(forecastFrom('2026-10-24')).toBe('2026-10-09');
  });
  it('crosses month boundaries', () => {
    expect(forecastFrom('2026-11-01')).toBe('2026-10-17');
  });
});

describe('weatherLabel', () => {
  it.each([
    [0, 'Clear'],
    [2, 'Partly cloudy'],
    [63, 'Rain'],
    [61, 'Light rain'],
    [82, 'Heavy showers'],
    [75, 'Snow'],
    [97, 'Thunderstorms'],
    [4, 'Mixed'],
  ])('code %i → %s', (code, label) => expect(weatherLabel(code)).toBe(label));
});

describe('daytimeRain / slotRain', () => {
  const hw = (rain: number) => ({ code: 0, temp: 20, rain });
  const hours = {
    'osaka:2026-10-26T03': hw(80),
    'osaka:2026-10-26T20': hw(22),
    'osaka:2026-10-26T21': hw(23),
    'osaka:2026-10-26T22': hw(22),
  };
  it('takes the highest chance from 08:00 to midnight, ignoring the small hours', () => {
    expect(daytimeRain(hours, 'osaka', '2026-10-26')).toBe(23);
    expect(daytimeRain({}, 'osaka', '2026-10-26')).toBeNull();
  });
  it('covers both hours of a 2-hour slot', () => {
    expect(slotRain(hours, 'osaka', '2026-10-26', 20)).toBe(23);
    expect(slotRain(hours, 'osaka', '2026-10-26', 22)).toBe(22);
    expect(slotRain(hours, 'osaka', '2026-10-26', 8)).toBeNull();
  });
});

describe('daytimeCode', () => {
  it('ignores dawn fog and takes the worst code from 08:00 to midnight', () => {
    const hours = forecast({
      'OSAKA:2026-10-25T05': hour({ code: 45 }),
      'OSAKA:2026-10-25T08': hour({ code: 1 }),
      'OSAKA:2026-10-25T14': hour({ code: 2 }),
      'OSAKA:2026-10-25T23': hour({ code: 0 }),
    }).hours;
    expect(daytimeCode(hours, 'OSAKA', '2026-10-25')).toBe(2);
  });

  it('is null without an hourly forecast', () => {
    expect(daytimeCode({}, 'OSAKA', '2026-10-25')).toBeNull();
  });
});

describe('pastDays', () => {
  it('counts back to the trip start, never below 0 or past 92', () => {
    expect(pastDays('2026-10-28')).toBe(4);
    expect(pastDays('2026-10-20')).toBe(0);
    expect(pastDays('2027-06-01')).toBe(92);
  });
});
