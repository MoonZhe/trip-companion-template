'use client';
import { useEffect, useState } from 'react';
import { AirplaneLanding, AirplaneTakeoff, ArrowSquareOut, Bed, SignOut } from '@phosphor-icons/react';
import { useTripData } from '@/components/providers/TripData';
import { StaffCards } from '@/components/trip/StaffCards';
import { KonbiniGuide } from '@/components/trip/KonbiniGuide';
import { TicketWallet } from '@/components/trip/TicketWallet';
import { OfflineStatus } from '@/components/trip/OfflineStatus';
import { MorningBrief } from '@/components/trip/MorningBrief';
import { NotificationHistory } from '@/components/trip/NotificationHistory';
import { TripSkeleton } from '@/components/ui/States';
import { Segmented } from '@/components/ui/Segmented';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { flush, pending } from '@/lib/offline/store';
import { wipeLocalData } from '@/lib/offline/wipe';
import { stopPushForSignOut } from '@/lib/push/client';
import { hotelMapsUrl } from '@/lib/trip/city';

// Optional: the planning sheet's address, for the "Open the Google Sheet" link.
const SHEET_URL = process.env.NEXT_PUBLIC_SHEET_URL ?? '';

export default function MorePage() {
  const { trip } = useTripData();
  const [tab, setTab] = useState<'tickets' | 'staff' | 'trip' | 'history'>('tickets');
  if (!trip) return <TripSkeleton />;
  return (
    <div className="mx-auto max-w-3xl">
      <header className="grid gap-4 pt-2 pb-5">
        <h1 className="text-[40px] leading-none font-semibold tracking-tight">More</h1>
        <Segmented
          label="Section"
          hideLabel
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tickets', label: 'Tickets' },
            { value: 'staff', label: 'Japanese' },
            { value: 'trip', label: 'Trip info' },
            { value: 'history', label: 'History' },
          ]}
        />
      </header>
      {tab === 'tickets' && <TicketWallet />}
      {tab === 'staff' && (
        <div className="grid gap-10">
          <StaffCards />
          <KonbiniGuide />
        </div>
      )}
      {tab === 'history' && <NotificationHistory />}
      {tab === 'trip' && (
        <div className="grid gap-10">
          <TripInfo />
          <MorningBrief />
          <OfflineStatus />
          <Footer />
        </div>
      )}
    </div>
  );
}

function TripInfo() {
  const { trip } = useTripData();
  const { flights, hotels } = trip!;
  return (
    <section className="grid gap-4">
      <h2 className="text-xl font-semibold tracking-tight">Flights and hotels</h2>
      <div className="grid gap-3">
        {flights.map((f) => {
          const Icon = f.direction === 'outbound' ? AirplaneTakeoff : AirplaneLanding;
          const [terminal, flightNo, seats] = f.details.split('\n');
          return (
            <article key={f.direction} className="rounded-[24px] border border-line bg-card p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-faint">
                <Icon size={18} className="text-accent-text" />
                {f.direction === 'outbound' ? 'Going' : 'Coming home'} · {f.airline} {flightNo}
              </div>
              <p className="mt-2 text-[17px] leading-snug font-semibold">{f.route}</p>
              <dl className="tabular mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[15px]">
                <div>
                  <dt className="text-xs text-ink-faint">Departs</dt>
                  <dd>{f.departure}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Arrives</dt>
                  <dd>{f.arrival}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Terminal</dt>
                  <dd>{terminal}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Seats</dt>
                  <dd>{seats}</dd>
                </div>
              </dl>
              {f.luggage && <p className="mt-2 text-xs text-ink-faint">{f.luggage}</p>}
            </article>
          );
        })}

        {hotels.map((h) => (
          <a
            key={h.name}
            href={hotelMapsUrl(h)}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-[24px] border border-line bg-card p-5 active:scale-[0.99]"
          >
            <Bed size={22} className="mt-0.5 shrink-0 text-accent-text" />
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
              <span className="text-[16px] font-semibold">{h.name}</span>
              <span className="text-sm text-ink-soft">{h.area}</span>
              <span className="text-xs text-ink-faint">{h.nightsLabel}</span>
            </span>
            <ArrowSquareOut size={18} className="mt-1 shrink-0 text-ink-faint" />
          </a>
        ))}
      </div>
    </section>
  );
}

type Scope = 'local' | 'global';

function Footer() {
  const [busy, setBusy] = useState<Scope | null>(null);
  // Second tap needed: before signing out everywhere, or when changes haven't synced yet.
  const [armed, setArmed] = useState<'everywhere' | `${Scope}-unsent` | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // "Tap again to sign out everywhere" resets itself after a few seconds, like the delete buttons.
  useEffect(() => {
    if (armed !== 'everywhere') return;
    const t = setTimeout(() => {
      setArmed(null);
      setNote(null);
    }, 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function signOut(scope: Scope) {
    if (busy) return;
    if (scope === 'global' && armed !== 'everywhere' && armed !== 'global-unsent') {
      setArmed('everywhere');
      setNote('Signs you out on every phone and browser, including this one. Tap again to do it.');
      return;
    }
    setBusy(scope);
    setNote(null);
    const sb = supabaseBrowser();
    const unsent = await flush(sb).catch(() => pending());
    if (unsent > 0 && armed !== `${scope}-unsent`) {
      setBusy(null);
      setArmed(`${scope}-unsent`);
      setNote(
        `${unsent} change${unsent === 1 ? " hasn't" : "s haven't"} synced yet and will be lost. Tap again to sign out anyway.`,
      );
      return;
    }
    // Needs the session, so before signing out. Offline it fails and signing out fails too, so ignore it here.
    await stopPushForSignOut(scope === 'global').catch(() => {});
    const { error } = await sb.auth.signOut({ scope });
    if (error) {
      setBusy(null);
      setArmed(null);
      setNote('Signing out needs signal. Try again when you are online.');
      return;
    }
    await wipeLocalData();
    // A full load, so nothing from this session stays in memory either.
    window.location.replace('/login');
  }

  return (
    <section className="grid gap-2 pb-4">
      {SHEET_URL && (
        <a
          href={SHEET_URL}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-14 items-center justify-between rounded-2xl border border-line bg-card px-5 text-[15px] font-medium"
        >
          Open the Google Sheet
          <ArrowSquareOut size={18} className="text-ink-faint" />
        </a>
      )}
      <button
        onClick={() => signOut('local')}
        disabled={!!busy}
        className="flex min-h-14 items-center justify-between rounded-2xl px-5 text-[15px] font-medium text-ink-soft disabled:opacity-60"
      >
        {busy === 'local' ? 'Signing out' : armed === 'local-unsent' ? 'Sign out anyway' : 'Sign out'}
        <SignOut size={18} />
      </button>
      <button
        onClick={() => signOut('global')}
        disabled={!!busy}
        className={`flex min-h-12 items-center justify-between rounded-2xl px-5 text-left text-sm font-medium disabled:opacity-60 ${
          armed === 'everywhere' || armed === 'global-unsent' ? 'text-warn' : 'text-ink-faint'
        }`}
      >
        {busy === 'global'
          ? 'Signing out everywhere'
          : armed === 'everywhere' || armed === 'global-unsent'
            ? 'Tap to sign out everywhere'
            : 'Lost a phone? Sign out everywhere'}
      </button>
      {note && (
        <p role="status" className="px-5 text-sm text-ink-soft">
          {note}
        </p>
      )}
      <p className="px-5 text-xs leading-relaxed text-ink-faint">
        A lost phone keeps its offline copy until it next gets signal; then it&apos;s signed out and cleared.
      </p>
    </section>
  );
}
