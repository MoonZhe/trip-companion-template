import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { recordSent } from './deliver';
import { composeBrief, pushBrief, type BriefKind } from './send';

/** Shared by both crons. `?test=1` (with the secret) sends Day 1 even off-trip days. */
export async function sendScheduled(request: NextRequest, kind: BriefKind) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const admin = supabaseAdmin();
  const test = request.nextUrl.searchParams.get('test') === '1';
  const brief = await composeBrief(admin, { kind, anyDay: test });
  if (!brief) return NextResponse.json({ sent: 0 });
  try {
    const result = await pushBrief(admin, brief);
    if (!test) await recordSent(admin, brief, result.devices);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
