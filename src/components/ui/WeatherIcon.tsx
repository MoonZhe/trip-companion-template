import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from '@phosphor-icons/react';
import { weatherKind } from '@/lib/trip/weather';

const ICONS = { sun: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
const LABELS = { sun: 'Sunny', partly: 'Partly cloudy', cloud: 'Cloudy', fog: 'Foggy', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms' };

/** Icon for a WMO weather code. `label` is the screen reader text; defaults to the kind's name. */
export function WeatherIcon({ w, size = 14, label }: { w: { code: number }; size?: number; label?: string }) {
  const kind = weatherKind(w.code);
  const Icon = ICONS[kind];
  return <Icon size={size} weight="fill" aria-label={label ?? LABELS[kind]} />;
}
