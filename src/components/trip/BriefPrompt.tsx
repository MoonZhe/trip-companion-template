'use client';
import { useEffect, useState } from 'react';
import { BellSimple } from '@phosphor-icons/react';
import { currentSubscription, enablePush, iosInBrowser, pushSupported } from '@/lib/push/client';

const DISMISSED = 'brief-prompt-dismissed';

/**
 * A one-time card offering the morning brief. Phones only show the Allow prompt after a tap, so
 * this is the nearest thing to "on by default". Shown until it's answered either way.
 */
export function BriefPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      if (!pushSupported() || iosInBrowser() || Notification.permission !== 'default') return;
      try {
        if (localStorage.getItem(DISMISSED)) return;
      } catch {}
      if (!(await currentSubscription())) setShow(true);
    })().catch(() => {});
  }, []);

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {}
  };

  if (!show) return null;
  return (
    <section className="mb-4 grid gap-3 rounded-2xl border border-line bg-card p-4">
      <p className="flex gap-3 text-[15px] leading-snug">
        <BellSimple size={22} weight="fill" className="shrink-0 text-accent-text" />
        <span>
          <span className="font-semibold">Get the daily brief?</span>{' '}
          <span className="text-ink-soft">8am: the day&apos;s weather and first stop. 9pm: a look at tomorrow.</span>
        </span>
      </p>
      <div className="flex gap-2 pl-[2.125rem]">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            try {
              await enablePush();
              close();
            } catch (err) {
              // A "no" is an answer; a dropped connection isn't, so keep the card for another try.
              if (err instanceof Error && err.message === 'denied') close();
              else setFailed(true);
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink active:scale-[0.98] disabled:opacity-60"
        >
          Turn on
        </button>
        <button
          type="button"
          onClick={close}
          className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-medium active:scale-[0.98]"
        >
          Not now
        </button>
      </div>
      {failed && (
        <p role="status" className="pl-[2.125rem] text-sm text-ink-soft">
          Couldn&apos;t turn it on. Check your signal and try again.
        </p>
      )}
    </section>
  );
}
