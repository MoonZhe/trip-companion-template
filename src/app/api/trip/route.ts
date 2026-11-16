import { NextResponse, type NextRequest } from 'next/server';
import { loadTrip } from '@/lib/sheet/load';
import { supabaseServer } from '@/lib/supabase/server';
import { apiUser } from '@/lib/supabase/api';

export async function GET(request: NextRequest) {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  try {
    const trip = await loadTrip(supabase, { fresh: request.nextUrl.searchParams.has('fresh') });
    return NextResponse.json(trip, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'The itinerary is unavailable right now' }, { status: 503 });
  }
}
