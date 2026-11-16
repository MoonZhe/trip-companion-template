/**
 * A traditional pattern (wagara) per city, drawn as a CSS mask so it takes the city's accent colour.
 * Osaka: kikkō (tortoise shell) · Kyoto: shippō (seven treasures) · Nara: same-komon dots ·
 * Tokyo: ichimatsu (checks) · Kamakura: nami (waves, it's by the sea).
 */
const svg = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`,
  )}")`;

const line = "fill='none' stroke='black' stroke-width='1.2'";

const PATTERNS: Record<string, { image: string; size: string }> = {
  OSAKA: {
    image: svg(30, 17.32, `<path ${line} d='M0 8.66 5 0h10l5 8.66L15 17.32H5ZM20 8.66h10'/>`),
    size: '30px 17.32px',
  },
  KYOTO: {
    image: svg(
      40,
      40,
      `<g ${line}><circle cx='0' cy='0' r='20'/><circle cx='40' cy='0' r='20'/><circle cx='0' cy='40' r='20'/><circle cx='40' cy='40' r='20'/><circle cx='20' cy='20' r='20'/></g>`,
    ),
    size: '40px 40px',
  },
  NARA: {
    image: svg(12, 12, "<circle cx='3' cy='3' r='1.3'/><circle cx='9' cy='9' r='1.3'/>"),
    size: '12px 12px',
  },
  TOKYO: {
    image: svg(24, 24, "<rect width='12' height='12'/><rect x='12' y='12' width='12' height='12'/>"),
    size: '24px 24px',
  },
  KAMAKURA: {
    image: svg(24, 12, `<path ${line} d='M0 8q6-8 12 0t12 0'/>`),
    size: '24px 12px',
  },
};

export function cityPattern(cityKey: string): React.CSSProperties {
  const p = PATTERNS[cityKey] ?? PATTERNS.TOKYO;
  return {
    maskImage: p.image,
    WebkitMaskImage: p.image,
    maskSize: p.size,
    WebkitMaskSize: p.size,
    maskRepeat: 'repeat',
    WebkitMaskRepeat: 'repeat',
  };
}
