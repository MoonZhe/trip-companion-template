import { NextResponse, type NextRequest } from 'next/server';
import { loadTrip } from '@/lib/sheet/load';
import { addStopToSheet, removeStopFromSheet } from '@/lib/sheet/write';
import { supabaseServer } from '@/lib/supabase/server';
import { apiUser } from '@/lib/supabase/api';

const CATEGORIES = ['🍜 Food', '🏛 Culture', '🏙 Sightseeing', '🛍 Shopping', '🌿 Nature', '🚃 Transport', '🎉 Experience'];

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const day = Number(body?.day);
  const time = String(body?.time ?? '');
  const title = String(body?.title ?? '').trim();
  const notes = String(body?.notes ?? '').trim();
  // One line: it becomes the 📍 line the map and directions read.
  const place = String(body?.place ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const category = String(body?.category ?? '');
  const cost = body?.costJpy === null || body?.costJpy === undefined || body?.costJpy === '' ? null : Number(body.costJpy);

  if (!Number.isInteger(day) || day < 1 || day > 30) return NextResponse.json({ error: 'Pick a day' }, { status: 400 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NextResponse.json({ error: 'Pick a time' }, { status: 400 });
  if (!title || title.length > 80) return NextResponse.json({ error: 'Give it a short name' }, { status: 400 });
  if (notes.length > 300) return NextResponse.json({ error: 'Notes are too long' }, { status: 400 });
  if (place.length > 120) return NextResponse.json({ error: 'The place name is too long' }, { status: 400 });
  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: 'Pick a category' }, { status: 400 });
  if (cost !== null && (!Number.isFinite(cost) || cost < 0))
    return NextResponse.json({ error: 'Check the cost' }, { status: 400 });

  try {
    await addStopToSheet({ day, time, title, notes, place: place || undefined, category, costJpy: cost });
    const trip = await loadTrip(supabase, { fresh: true });
    return NextResponse.json(trip);
  } catch (err) {
    console.error('[stops] add failed', err);
    return NextResponse.json({ error: 'Could not add it to the sheet. Try again in a moment.' }, { status: 502 });
  }
}

/** Deletes a stop that was added from the app. Planned stops aren't touched. */
export async function DELETE(request: NextRequest) {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const day = Number(body?.day);
  const time = String(body?.time ?? '');
  const title = String(body?.title ?? '').trim();
  if (!Number.isInteger(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !title || title.length > 80)
    return NextResponse.json({ error: 'That stop could not be found' }, { status: 400 });

  try {
    await removeStopFromSheet({ day, time, title });
    const trip = await loadTrip(supabase, { fresh: true });
    return NextResponse.json(trip);
  } catch (err) {
    console.error('[stops] delete failed', err);
    return NextResponse.json({ error: 'Could not remove it from the sheet. Try again in a moment.' }, { status: 502 });
  }
}
