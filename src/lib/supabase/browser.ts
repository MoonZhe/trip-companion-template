'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/** Long enough for a slow train connection, short enough that a dead one doesn't freeze syncing or Sign out. */
const TIMEOUT_MS = 15_000;

/**
 * Data and sign-in requests give up after TIMEOUT_MS. On a half-dead connection (navigator.onLine
 * still true) fetch can otherwise hang for a minute or more, holding up every queued change.
 * Storage is left alone: a photo upload on hotel wifi can rightly take longer.
 */
const timedFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const bounded = /\/(rest|auth)\/v1\//.test(url) && !init?.signal && typeof AbortSignal.timeout === 'function';
  return fetch(input, bounded ? { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) } : init);
};

export function supabaseBrowser(): SupabaseClient {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { fetch: timedFetch },
  });
  return client;
}
