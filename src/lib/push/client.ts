'use client';

/** Browser support for notifications: a service worker, push, and the Notification API. */
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** True on an iPhone using the app in Safari rather than from the Home Screen (iOS only allows push from there). */
export function iosInBrowser(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || !!(navigator as { standalone?: boolean }).standalone;
  return ios && !standalone;
}

/** This phone's current push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Which service worker version this phone is running (null when it's too old to say). */
export async function workerVersion(): Promise<string | null> {
  const reg = await navigator.serviceWorker.ready;
  await reg.update().catch(() => {});
  const worker = reg.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(typeof e.data === 'string' ? e.data : null);
    };
    worker.postMessage({ type: 'version' }, [channel.port2]);
  });
}

/** Save a subscription on the server. The server upserts by endpoint, so re-sending one is harmless. */
async function saveSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error('save failed');
}

/** Ask for permission, subscribe this phone, and save the subscription on the server. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
  try {
    await saveSubscription(sub);
  } catch {
    // No server row means no brief, so don't leave a subscription behind that makes the switch read "On".
    await sub.unsubscribe().catch(() => {});
    throw new Error('save failed');
  }
}

/**
 * Re-save this phone's subscription, if it has one. The browser can swap in a new one, or the
 * server row can be dropped after a failed send, and then the switch reads "On" with no brief.
 */
export async function resavePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) await saveSubscription(sub);
}

/** Turn the brief off on this phone: remove the server row, then the browser subscription. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch('/api/push', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

/**
 * Stop the brief before signing out, while the session can still delete rows. `everywhere` also
 * removes this person's other phones, so a lost phone stops showing trip details on its lock screen.
 */
export async function stopPushForSignOut(everywhere: boolean): Promise<void> {
  if (everywhere) {
    await fetch('/api/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
  }
  if (pushSupported()) await disablePush();
}
