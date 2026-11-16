'use client';
import { clearLocalFiles } from '@/lib/files/store';
import { clearCache } from './store';

/**
 * Remove everything the app keeps on this phone: the itinerary and money cache, downloaded tickets
 * and bookings, and the offline page copies. Runs on sign-out and whenever the sign-in page opens,
 * so a phone that was signed out (here or from the other phone) holds nothing private.
 */
export async function wipeLocalData(): Promise<void> {
  await Promise.allSettled([
    clearCache(),
    clearLocalFiles(),
    typeof caches === 'undefined' ? undefined : caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
  ]);
}
