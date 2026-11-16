// One-off: pre-create the only two accounts (public sign-ups stay disabled).
// Run: pnpm tsx --env-file=.env.local scripts/setup-users.mts
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const emails = (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const { data: existing, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;

for (const email of emails) {
  if (existing.users.some((u) => u.email === email)) {
    console.log('exists  ', email);
    continue;
  }
  const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  console.log('created ', email);
}
