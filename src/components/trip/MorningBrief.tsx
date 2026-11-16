'use client';
import { TRIP } from '@/trip.config';
import { useEffect, useState } from 'react';
import { BellSimple, PaperPlaneTilt } from '@phosphor-icons/react';
import {
  currentSubscription,
  disablePush,
  enablePush,
  iosInBrowser,
  pushSupported,
  resavePush,
  workerVersion,
} from '@/lib/push/client';

type State = 'unsupported' | 'denied' | 'off' | 'on';

/** Opt-in morning brief for this phone: one calm row that turns notifications on or off. */
export function MorningBrief() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!pushSupported() || iosInBrowser()) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const on = !!(await currentSubscription());
      setState(on ? 'on' : 'off');
      // Quietly make sure the server still has this phone, so "On" really means a brief arrives.
      if (on) resavePush().catch(() => {});
    })().catch(() => setState('unsupported'));
  }, []);

  async function toggle() {
    if (busy || !state || state === 'unsupported' || state === 'denied') return;
    setBusy(true);
    setNote(null);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        await enablePush();
        setState('on');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'denied') setState('denied');
      else setNote('Could not change it. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      // A phone still running the old worker has nothing to show the notification with.
      const version = await workerVersion();
      if (!version) {
        setNote(
          'This phone is still on an older copy of the app. Close the app fully (swipe it away), open it again, then retry.',
        );
        return;
      }
      const res = await fetch('/api/push/test', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { sent?: number };
      if (!res.ok) setNote('Could not send the test. Check your signal and try again.');
      else if (!body.sent) setNote('This phone isn’t set up yet. Turn the brief off and on again, then retry.');
      else setNote(`Sent to ${body.sent} phone${body.sent > 1 ? 's' : ''} (app ${version}). It should pop up in a few seconds.`);
    } catch {
      setNote('Could not send the test. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (state === null) return null;
  const on = state === 'on';
  const blocked = state === 'unsupported' || state === 'denied';

  return (
    <section className="grid gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={blocked}
        disabled={busy || blocked}
        onClick={toggle}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-card px-5 py-3 text-left disabled:opacity-70"
      >
        <BellSimple size={22} className="shrink-0 text-accent-text" />
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
          <span className="text-[15px] font-medium">Morning brief</span>
          <span className="text-sm text-ink-soft">8am: today&apos;s weather and first stop · 9pm: tomorrow</span>
        </span>
        <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-sunk'}`}>
          <span
            className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-card shadow-soft transition-transform ${
              on ? 'translate-x-5' : ''
            }`}
          />
        </span>
      </button>
      {on && (
        <button
          type="button"
          onClick={sendTest}
          disabled={busy}
          className="mx-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-line px-4 text-sm font-medium active:scale-[0.98] disabled:opacity-60"
        >
          <PaperPlaneTilt size={16} />
          Send a test notification
        </button>
      )}
      {state === 'unsupported' && (
        <p className="px-5 text-sm leading-relaxed text-ink-soft">
          {iosUnsupported()
            ? 'On iPhone, add this app to your Home Screen first (iOS 16.4 or later), then open it from there to turn this on.'
            : 'This browser can’t send notifications for the app.'}
        </p>
      )}
      {state === 'denied' && (
        <p className="px-5 text-sm leading-relaxed text-ink-soft">
          Notifications are blocked for this app. Allow them in your phone&apos;s settings for {TRIP.name}, then come back here.
        </p>
      )}
      {note && (
        <p role="status" className="px-5 text-sm text-ink-soft">
          {note}
        </p>
      )}
    </section>
  );
}

function iosUnsupported(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
