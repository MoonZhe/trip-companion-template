import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { nearestNode, type LatLng } from '@/lib/trip/geo';
import { apiUser } from '@/lib/supabase/api';

// Backup for when Google Places can't answer: stations from OpenStreetMap.
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const RADIUS = 1200;

const valid = (p: unknown): p is LatLng =>
  !!p &&
  typeof p === 'object' &&
  Number.isFinite((p as LatLng).lat) &&
  Number.isFinite((p as LatLng).lng) &&
  Math.abs((p as LatLng).lat) <= 90 &&
  Math.abs((p as LatLng).lng) <= 180;

/**
 * POST { points: [{lat, lng}, …] } → { stations: [{name, lat, lng} | null, …] }, the train or metro
 * station nearest each point (within 1.2 km). One Overpass query for the lot; callers cache it.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => null);
  const points: unknown[] = Array.isArray(body?.points) ? body.points : [];
  if (!points.length || points.length > 30 || !points.every(valid))
    return NextResponse.json({ error: 'Send 1–30 points with lat and lng' }, { status: 400 });

  const around = (points as LatLng[])
    .map((p) => `node(around:${RADIUS},${p.lat},${p.lng})[railway~"^(station|halt)$"];`)
    .join('');
  const query = `[out:json][timeout:25];(${around});out;`;

  for (const url of SERVERS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'User-Agent': 'trip-companion-app/1.0' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const { elements = [] } = (await res.json()) as {
        elements?: { lat: number; lon: number; tags?: Record<string, string> }[];
      };
      const stations = (points as LatLng[]).map((p) => nearestNode(p, elements, RADIUS));
      return NextResponse.json({ stations });
    } catch {
      // Try the next server.
    }
  }
  return NextResponse.json({ error: 'Station lookup is unavailable right now' }, { status: 503 });
}
