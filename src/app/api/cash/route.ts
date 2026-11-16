import { NextResponse, type NextRequest } from 'next/server';
import { loadTrip } from '@/lib/sheet/load';
import { ExchangeConflict, setExchangeInSheet } from '@/lib/sheet/write';
import type { ExchangeTotals } from '@/lib/money/exchange';
import { supabaseServer } from '@/lib/supabase/server';
import { apiUser } from '@/lib/supabase/api';

/** Amounts as the sheet keeps them, or null when one is missing or out of range. */
function totals(v: unknown): ExchangeTotals | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const rm = Number(o.rm ?? 0);
  const jpy = Number(o.jpy ?? 0);
  const backJpy = Number(o.backJpy ?? 0);
  const backRm = Number(o.backRm ?? 0);
  const ok = (n: number, max: number) => Number.isFinite(n) && n >= 0 && n < max;
  if (!ok(rm, 1_000_000) || !ok(backRm, 1_000_000) || !ok(jpy, 100_000_000) || !ok(backJpy, 100_000_000)) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { rm: r2(rm), jpy: Math.round(jpy), backJpy: Math.round(backJpy), backRm: r2(backRm) };
}

/**
 * Saves one person's cash exchange or Wise top-up totals to the sheet (`next` null clears them), with
 * an optional History line. `expected` is what the phone last saw; if the sheet has moved on, nothing
 * is written and the fresh trip comes back with a 409. Returns the fresh trip.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind ?? 'cash';
  const person = body?.person;
  const next = body?.next === null ? null : totals(body?.next);
  const expected = body?.expected == null ? null : totals(body.expected);
  const line = typeof body?.line === 'string' ? body.line.slice(0, 200) : null;

  if (kind !== 'cash' && kind !== 'wise') return NextResponse.json({ error: 'Cash or Wise?' }, { status: 400 });
  if (person !== 'alex' && person !== 'sam') return NextResponse.json({ error: 'Pick whose money it is' }, { status: 400 });
  if (body?.next !== null && !next) return NextResponse.json({ error: 'Check the amounts' }, { status: 400 });

  try {
    await setExchangeInSheet(kind, person, expected, next, line);
    const trip = await loadTrip(supabase, { fresh: true });
    return NextResponse.json(trip);
  } catch (err) {
    if (err instanceof ExchangeConflict) {
      const trip = await loadTrip(supabase, { fresh: true }).catch(() => null);
      return NextResponse.json(
        { error: 'The totals changed on the other phone, so nothing was saved. Check them and try again.', trip },
        { status: 409 },
      );
    }
    console.error('[cash] save failed', err);
    return NextResponse.json({ error: 'Could not save it to the sheet. Try again in a moment.' }, { status: 502 });
  }
}
