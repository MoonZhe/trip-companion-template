'use client';
import { useEffect } from 'react';

/**
 * Registers the offline service worker, then (when online) asks it to save every page and the
 * scripts this page loaded, so the app still opens from the home screen with no signal.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      // Check for a newer worker on every open; phones keep the app alive in the background for days.
      .then((reg) => reg.update().catch(() => {}))
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (!navigator.onLine) return;
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => new URL(e.name).pathname)
          .filter((p) => p.startsWith('/_next/static/'));
        reg.active?.postMessage({ type: 'warm', urls });
      })
      .catch(() => {});
  }, []);
  return null;
}
