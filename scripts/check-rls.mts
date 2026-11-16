// Integration check: a signed-in account that is NOT on the allowlist sees nothing and can't write.
// Run: pnpm tsx --env-file=.env.local scripts/check-rls.mts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = `rls-probe-${Date.now()}@example.com`;
const password = crypto.randomUUID();

const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) throw createError;

let failed = false;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed = true;
};

try {
  const outsider = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: signInError } = await outsider.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  for (const table of ['expenses', 'checks', 'wishlist', 'trip_settings', 'sheet_snapshot']) {
    const { data } = await outsider.from(table).select('*');
    check(`outsider reads 0 rows from ${table}`, (data ?? []).length === 0);
  }
  const { error: insertError } = await outsider.from('expenses').insert({
    client_id: crypto.randomUUID(),
    spent_on: '2026-10-24',
    amount: 1,
    currency: 'JPY',
    category: 'food',
    paid_by: 'alex',
  });
  check('outsider cannot insert an expense', !!insertError);
  const { data: emails } = await outsider.from('allowed_emails').select('*');
  check('outsider cannot read the allowlist', (emails ?? []).length === 0);

  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: anonRows } = await anon.from('expenses').select('*');
  check('anonymous visitor reads 0 expenses', (anonRows ?? []).length === 0);
  const { error: signupError } = await anon.auth.signUp({ email: `new-${Date.now()}@example.com`, password });
  check('public sign-up is disabled', !!signupError);
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
}
process.exit(failed ? 1 : 0);
