import { TRIP } from '@/trip.config';
import Link from 'next/link';

export default function PrivatePage() {
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-md content-center gap-4 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">This trip is private</h1>
      <p className="text-[15px] text-ink-soft">Only {TRIP.travellers} can open this app. You have been signed out.</p>
      <Link href="/login" className="text-[15px] font-medium underline underline-offset-4">
        Back to sign in
      </Link>
    </main>
  );
}
