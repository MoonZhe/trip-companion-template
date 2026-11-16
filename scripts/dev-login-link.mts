// Local testing only: prints a one-time sign-in URL for an allowlisted account.
// Run: pnpm tsx --env-file=.env.local scripts/dev-login-link.mts [email] [origin]
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2] ?? process.env.ALLOWED_EMAILS!.split(',')[0];
const origin = process.argv[3] ?? 'http://localhost:3000';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (error) throw error;
console.log(`${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
