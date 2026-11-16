import { TRIP } from '@/trip.config';
const rmFmt = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0Fmt = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });
const jpyFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

export const rm = (n: number) => `RM ${rmFmt.format(n)}`;
export const rm0 = (n: number) => `RM ${rm0Fmt.format(Math.round(n))}`;
/** A ringgit amount small enough for a chart label: 85, 240, 1.2k. */
export const shortRm = (n: number) =>
  n >= 999.5 ? `${(n / 1000).toFixed(n >= 9950 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(n));
export const jpy = (n: number) => `¥${jpyFmt.format(Math.round(n))}`;

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00${TRIP.utcOffset}`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TRIP.timeZone });
}
