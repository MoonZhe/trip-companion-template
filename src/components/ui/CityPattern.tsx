import { cityPattern } from '@/lib/trip/patterns';

/** The city's wagara pattern behind a header or card. Colour comes from `currentColor`. */
export function CityPattern({ city, className = '', fade = 'down' }: { city: string; className?: string; fade?: 'down' | 'right' | 'none' }) {
  const fadeMask =
    fade === 'down'
      ? 'linear-gradient(to bottom, black 0%, transparent 85%)'
      : fade === 'right'
        ? 'linear-gradient(to left, black 0%, transparent 70%)'
        : undefined;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={fadeMask ? { maskImage: fadeMask, WebkitMaskImage: fadeMask } : undefined}
    >
      <div className="absolute inset-0 bg-current" style={cityPattern(city)} />
    </div>
  );
}
