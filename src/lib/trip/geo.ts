export interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line metres between two points. */
export function metres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Streets aren't straight: allow a third extra distance at an easy 75 m a minute. */
export const walkMinutes = (m: number) => Math.max(1, Math.round((m * 1.3) / 75));

/** "Namba Station" → "Namba", "難波駅" → "難波"; keeps the chip short. */
export const shortStation = (name: string) =>
  name
    .replace(/\s+(Station|Stn\.?)$/i, '')
    .replace(/駅$/, '')
    .trim();

interface OsmNode {
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

/** The closest named station among OpenStreetMap nodes (within `within` metres), preferring the English name. */
export function nearestNode(
  from: LatLng,
  nodes: OsmNode[],
  within = Infinity,
): { name: string; lat: number; lng: number } | null {
  let best: { name: string; lat: number; lng: number; d: number } | null = null;
  for (const n of nodes) {
    const name = n.tags?.['name:en'] ?? n.tags?.['name:ja-Latn'] ?? n.tags?.['name:ja_rm'] ?? n.tags?.name;
    if (!name) continue;
    const d = metres(from, { lat: n.lat, lng: n.lon });
    if (d <= within && (!best || d < best.d)) best = { name: shortStation(name), lat: n.lat, lng: n.lon, d };
  }
  return best && { name: best.name, lat: best.lat, lng: best.lng };
}
