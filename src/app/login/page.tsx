'use client';
import { TRIP } from '@/trip.config';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EnvelopeSimple, GoogleLogo } from '@phosphor-icons/react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { wipeLocalData } from '@/lib/offline/wipe';
import { isTransientAuthError } from '@/lib/supabase/claims';

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(() =>
    params.get('error') ? 'That sign-in link did not work. Try again.' : null,
  );
  // Signed-out phones land here, e.g. after "Sign out everywhere" on the other phone: clear their
  // offline copy. But only when this phone really has no session; if the check just failed (no
  // signal, a Supabase blip), keep the tickets and itinerary.
  useEffect(() => {
    void supabaseBrowser()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!data.session && !(error && isTransientAuthError(error))) void wipeLocalData();
      })
      .catch(() => {});
  }, []);
  const redirectTo = () => `${window.location.origin}/auth/callback`;

  async function google() {
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (error) setError('Google sign-in is not available right now. Use the email link instead.');
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState('sending');
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo() },
    });
    if (error) {
      setState('idle');
      setError(/not allowed|signups|not found/i.test(error.message) ? `This trip is private to ${TRIP.travellers}.` : error.message);
    } else setState('sent');
  }

  return (
    <main
      className="mx-auto grid min-h-[100dvh] max-w-md content-center gap-10 px-6 py-12"
      style={{ '--accent': '#2D4563' } as React.CSSProperties}
    >
      <header className="grid gap-3">
        <p className="text-sm font-medium text-ink-faint">{TRIP.travellers}</p>
        <h1 className="text-[52px] leading-[0.95] font-semibold tracking-tight">
          {TRIP.name.split(' ').slice(0, -1).join(' ')}
          <br />
          <span className="text-accent-text">{TRIP.name.split(' ').at(-1)}</span>
        </h1>
        <p className="text-[15px] text-ink-soft">{TRIP.tagline}</p>
      </header>

      <div className="grid gap-6">
        <button
          onClick={google}
          className="flex min-h-14 items-center justify-center gap-3 rounded-full bg-ink text-base font-semibold text-paper active:scale-[0.98]"
        >
          <GoogleLogo size={22} weight="bold" />
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-line" />
          or get a link by email
          <span className="h-px flex-1 bg-line" />
        </div>

        {state === 'sent' ? (
          <p className="rounded-2xl border border-line bg-card p-4 text-[15px] text-ink-soft">
            Check your inbox for a sign-in link from Supabase. It can take a minute, and may land in spam.
            <br />
            <br />
            On iPhone the link opens in Safari, which signs in Safari, not the Home Screen app. In the Home Screen app, use
            Continue with Google instead.
          </p>
        ) : (
          <form onSubmit={magicLink} className="grid gap-3">
            <label htmlFor="email" className="text-sm font-medium text-ink-soft">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-14 rounded-2xl border border-line bg-card px-4 text-base outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-accent-ink active:scale-[0.98] disabled:opacity-60"
            >
              <EnvelopeSimple size={20} />
              {state === 'sending' ? 'Sending' : 'Email me a link'}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
