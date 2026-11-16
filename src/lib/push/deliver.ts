import webpush, { type PushSubscription } from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url?: string;
}

/** Apple's (or the push service's) answer for one device. */
export interface DeviceReport {
  /** Last 6 characters of the endpoint, enough to tell the phones apart (e.g. "9Hfg8Q"). */
  device: string;
  /** HTTP status from the push service: 201 = accepted, 410 = gone, 0 = no answer. */
  status: number;
  /** Apple's id for the message, when it accepted it. */
  apnsId?: string;
  /** Why it was refused (Apple sends e.g. {"reason":"BadDeviceToken"}). */
  reason?: string;
  /** The subscription was dropped from the server because the push service said it's gone. */
  removed?: boolean;
}

export const deviceOf = (endpoint: string) => endpoint.slice(-6);

function setVapid() {
  const contact = process.env.VAPID_SUBJECT || (process.env.ALLOWED_EMAILS ?? '').split(',')[0].trim();
  webpush.setVapidDetails(
    /^(mailto:|https:)/.test(contact) ? contact : `mailto:${contact}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

/**
 * Push to every subscription the client can see (the admin client sees all phones; a signed-in
 * client only its own, through RLS) and report each device's answer. Gone subscriptions are removed.
 */
export async function deliverAll(supabase: SupabaseClient, payload: PushPayload): Promise<DeviceReport[]> {
  setVapid();
  const { data: rows, error } = await supabase.from('push_subscriptions').select('endpoint, subscription');
  if (error) throw new Error(error.message);

  const body = JSON.stringify({ url: '/', ...payload });
  return Promise.all(
    (rows ?? []).map(async (row): Promise<DeviceReport> => {
      const device = deviceOf(row.endpoint as string);
      try {
        const res = await webpush.sendNotification(row.subscription as PushSubscription, body, {
          TTL: 60 * 60,
          // Without this iOS may hold the push until the phone wakes (seen: an iPhone got one an hour late).
          urgency: 'high',
        });
        return { device, status: res.statusCode, apnsId: res.headers['apns-id'] };
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        const status = e.statusCode ?? 0;
        const report: DeviceReport = { device, status, reason: (e.body || e.message || '').slice(0, 200) };
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
          report.removed = true;
        }
        return report;
      }
    }),
  );
}

export const accepted = (r: DeviceReport) => r.status >= 200 && r.status < 300;

/**
 * Save a notification to the History section, if any phone took it. Needs the admin client. A failure
 * here only costs the history entry: the notification has already gone out.
 */
export async function recordSent(admin: SupabaseClient, payload: PushPayload, devices: DeviceReport[]): Promise<void> {
  if (!devices.some(accepted)) return;
  const { title, body, tag } = payload;
  const { error } = await admin.from('sent_notifications').insert({ title, body, tag });
  if (error) console.error('[push] not saved to history', error.message);
}
