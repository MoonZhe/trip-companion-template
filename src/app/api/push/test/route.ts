import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { apiUser } from '@/lib/supabase/api';
import { composeBrief, pushBrief } from '@/lib/push/send';

export const dynamic = 'force-dynamic';

/** "Send a test": the morning brief and evening preview (Day 1's before the trip) to the signed-in person's own phones only. */
export async function POST() {
  const supabase = await supabaseServer();
  const user = await apiUser(supabase);
  if (user instanceof NextResponse) return user;

  try {
    const [morning, evening] = await Promise.all([
      composeBrief(supabase, { kind: 'morning', anyDay: true }),
      composeBrief(supabase, { kind: 'evening', anyDay: true }),
    ]);
    if (!morning || !evening) return NextResponse.json({ error: 'No trip day to show' }, { status: 404 });
    const result = await pushBrief(supabase, { ...morning, title: `Test · ${morning.title}` });
    await pushBrief(supabase, { ...evening, title: `Test · ${evening.title}` });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[push] test failed', (err as Error).message);
    return NextResponse.json({ error: 'Could not send the test. Try again.' }, { status: 502 });
  }
}
