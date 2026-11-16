import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { apiUser } from '@/lib/supabase/api';

/** The browsers' own push services (Chrome/Android, Safari/iOS, Firefox, Edge). The cron job posts to these URLs, so nothing else is accepted. */
const PUSH_HOSTS =
  /^(fcm\.googleapis\.com|web\.push\.apple\.com|[\w-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[\w.-]+\.notify\.windows\.com)$/;

function isPushService(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

/** Save this phone's push subscription for the signed-in user (RLS keeps rows private to them). */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => null)) as { subscription?: Record<string, unknown> } | null;
  const sub = body?.subscription;
  const keys = sub?.keys as Record<string, unknown> | undefined;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  if (!isPushService(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string')
    return NextResponse.json({ error: 'Check the notification subscription' }, { status: 400 });

  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint, subscription: sub }, { onConflict: 'endpoint' });
  if (error) {
    console.error('[push] save failed', error.message);
    return NextResponse.json({ error: 'Could not turn on the morning brief. Try again.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

/** Remove this phone's subscription, or with `all: true` every phone of the signed-in user ("Sign out everywhere"). */
export async function DELETE(request: NextRequest) {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown; all?: unknown } | null;
  const all = body?.all === true;
  if (!all && typeof body?.endpoint !== 'string') return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

  // RLS limits the delete to this user's rows; the always-true filter is there because PostgREST refuses an unfiltered delete.
  const rows = supabase.from('push_subscriptions').delete();
  const { error } = await (all ? rows.neq('endpoint', '') : rows.eq('endpoint', body!.endpoint as string));
  if (error) return NextResponse.json({ error: 'Could not turn off the morning brief. Try again.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
