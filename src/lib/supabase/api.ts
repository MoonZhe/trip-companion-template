import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isAllowedEmail } from '@/lib/allowlist';
import { sessionCheck } from './claims';

/**
 * For API routes: the signed-in, allowed user, or the response to send instead. A session that
 * couldn't be checked gets 503 (try again), not 401: the app treats 401 as signed out and goes
 * to /login.
 */
export async function apiUser(supabase: SupabaseClient): Promise<{ email: string | undefined } | NextResponse> {
  const s = await sessionCheck(supabase);
  if (s.state === 'unknown') return NextResponse.json({ error: 'auth check failed, try again' }, { status: 503 });
  if (s.state === 'out' || !isAllowedEmail(s.email)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return { email: s.email };
}
