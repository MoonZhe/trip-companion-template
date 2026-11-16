// Offline support: keep the app's pages and code on the phone so it opens without signal.
// Data (itinerary, expenses, tickets) is cached separately in IndexedDB by the app.
const VERSION = 'v4';
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const SHELL = ['/', '/days', '/money', '/more'];
const EXTRA = ['/manifest.webmanifest', '/icons/icon-192.png'];
// On one bar of signal a page request can hang for tens of seconds; show the saved copy after this.
const SLOW_MS = 3000;

const STATIC_URL = /\/_next\/static\/[^"'\s)\\]+/g;

/**
 * Save every page plus all the scripts and styles it needs. Runs on install and whenever the app
 * asks (after each online open), so a cold start offline has everything, not just what was used.
 */
async function warm(extraUrls = []) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  const wanted = new Set(extraUrls.filter((u) => u.startsWith('/_next/static/')));
  for (const path of SHELL) {
    try {
      const res = await fetch(new Request(path, { credentials: 'include', cache: 'no-store' }));
      // Signed out: the page redirects to /login. Don't overwrite a good copy with that.
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      for (const m of html.matchAll(STATIC_URL)) wanted.add(m[0]);
    } catch {
      // Offline: keep what we have.
    }
  }
  await Promise.allSettled(
    [...wanted].map(async (u) => {
      if (await statics.match(u)) return;
      const res = await fetch(u);
      if (res.ok) await statics.put(u, res);
    }),
  );
  await Promise.allSettled(EXTRA.map((u) => statics.add(u)));
  await prune();
}

/**
 * Drop the previous version's caches, but only once this version has the home page saved. After a
 * version bump on weak signal the old copies are still the best thing to open offline.
 */
async function prune() {
  if (!(await (await caches.open(PAGES)).match('/'))) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(warm().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(prune().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  // The app asks which worker is running, so it can tell when a phone is stuck on an old one.
  if (event.data?.type === 'version') return event.ports[0]?.postMessage(VERSION);
  if (event.data?.type === 'warm') event.waitUntil(warm(event.data.urls ?? []));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname === '/login') return;

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network first, fall back to the saved copy. "/days?d=4" uses the saved "/days".
  if (req.mode === 'navigate') {
    const saved = async () =>
      (await caches.match(url.pathname, { ignoreSearch: true })) || (await caches.match('/'));
    let saving = Promise.resolve();
    const network = fetch(req).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        saving = caches.open(PAGES).then((c) => c.put(url.pathname, copy));
      }
      return res;
    });
    // Keep the worker alive until the fresh page is saved, even when the saved copy was shown first.
    event.waitUntil(network.then(() => saving).catch(() => {}));
    event.respondWith(
      (async () => {
        const timer = new Promise((resolve) => setTimeout(() => resolve('slow'), SLOW_MS));
        const first = await Promise.race([network.catch(() => null), timer]);
        if (first === 'slow') {
          const hit = await saved();
          if (hit) return hit;
        }
        // No saved copy yet (first open on slow signal): keep waiting for the network.
        const res = first === 'slow' ? await network.catch(() => null) : first;
        // A server error (e.g. mid-deploy) shouldn't hide a good saved copy. Sign-in redirects and
        // 4xx pages still reach the user.
        if (res && res.status < 500) return res;
        return (await saved()) || res || Response.error();
      })(),
    );
  }
});

// Morning brief: show the push as a notification (one per day, replaced by the next).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Japan 2026', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag ?? 'morning-brief',
      data: { url: data.url ?? '/' },
    }),
  );
});

// Tapping the brief opens the app: reuse an open window if there is one. Only focus it, don't
// navigate: that reloads the page and loses a half-typed expense or the tab they were on.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => c.url.startsWith(self.location.origin));
      if (client) {
        await client.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
