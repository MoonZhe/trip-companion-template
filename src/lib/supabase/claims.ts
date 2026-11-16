import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Who is signed in, from the session JWT. The project signs tokens with an asymmetric (ES256) key,
 * so getClaims() verifies them locally against the cached public key: no round trip to Supabase
 * Auth on every page and API request, unlike getUser(). It still refreshes an expired session.
 */
export async function signedInUser(supabase: SupabaseClient): Promise<{ email: string | undefined } | null> {
  const s = await sessionCheck(supabase);
  return s.state === 'in' ? { email: s.email } : null;
}

export type SessionState = { state: 'in'; email: string | undefined } | { state: 'out' } | { state: 'unknown' };

/**
 * Like signedInUser, but tells "no session" apart from "couldn't check": a Supabase timeout or
 * 5xx while refreshing the hourly token is 'unknown', not signed out. Sending that to /login
 * would wipe the phone's offline tickets and itinerary over a blip.
 */
export async function sessionCheck(supabase: SupabaseClient): Promise<SessionState> {
  let res: Awaited<ReturnType<SupabaseClient['auth']['getClaims']>>;
  try {
    res = await supabase.auth.getClaims();
  } catch {
    // getClaims only throws for errors that aren't Supabase Auth's own (e.g. the key fetch failing oddly).
    return { state: 'unknown' };
  }
  const { data, error } = res;
  if (error) return isTransientAuthError(error) ? { state: 'unknown' } : { state: 'out' };
  if (!data?.claims) return { state: 'out' };
  const email = data.claims.email;
  return { state: 'in', email: typeof email === 'string' ? email : undefined };
}

/** No answer from Supabase Auth (status 0), or a server-side failure: worth trying again, not a sign-out. */
export function isTransientAuthError(error: { name?: string; status?: number }): boolean {
  if (error.name === 'AuthRetryableFetchError') return true;
  return error.status === undefined || error.status === 0 || error.status >= 500;
}
