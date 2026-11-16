import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isTransientAuthError, sessionCheck } from '@/lib/supabase/claims';

const client = (getClaims: () => Promise<unknown>) => ({ auth: { getClaims } }) as unknown as SupabaseClient;

describe('isTransientAuthError', () => {
  it('treats no answer and server trouble as a blip', () => {
    expect(isTransientAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toBe(true);
    expect(isTransientAuthError({ name: 'AuthApiError', status: 503 })).toBe(true);
  });
  it('treats a refused or missing session as signed out', () => {
    expect(isTransientAuthError({ name: 'AuthApiError', status: 400 })).toBe(false);
    expect(isTransientAuthError({ name: 'AuthSessionMissingError', status: 400 })).toBe(false);
    expect(isTransientAuthError({ name: 'AuthInvalidJwtError', status: 400 })).toBe(false);
  });
});

describe('sessionCheck', () => {
  it('reads the email from a valid session', async () => {
    const sb = client(async () => ({ data: { claims: { email: 'a@b.c' } }, error: null }));
    expect(await sessionCheck(sb)).toEqual({ state: 'in', email: 'a@b.c' });
  });
  it('is signed out with no session', async () => {
    expect(await sessionCheck(client(async () => ({ data: null, error: null })))).toEqual({ state: 'out' });
  });
  it('is unknown when the token refresh times out', async () => {
    const sb = client(async () => ({ data: null, error: { name: 'AuthRetryableFetchError', status: 0 } }));
    expect(await sessionCheck(sb)).toEqual({ state: 'unknown' });
    expect(await sessionCheck(client(() => Promise.reject(new TypeError('Failed to fetch'))))).toEqual({ state: 'unknown' });
  });
});
