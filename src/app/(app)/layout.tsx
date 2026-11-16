import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { isAllowedEmail, personFor } from '@/lib/allowlist';
import { supabaseServer } from '@/lib/supabase/server';
import { sessionCheck } from '@/lib/supabase/claims';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const supabase = await supabaseServer();
  const session = await sessionCheck(supabase);
  // Couldn't check the session (a Supabase blip): fail this load rather than sending a signed-in
  // phone to /login. The service worker shows the saved copy of the page on a server error.
  if (session.state === 'unknown') throw new Error('Could not check the sign-in. Try again.');
  if (session.state === 'out') redirect('/login');
  if (!isAllowedEmail(session.email)) redirect('/private');

  return <AppShell person={personFor(session.email)}>{children}</AppShell>;
}
