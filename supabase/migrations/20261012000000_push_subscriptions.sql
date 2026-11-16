-- Web Push subscriptions for the morning brief: one row per phone/browser, owned by the signed-in user.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Each person sees and changes only their own phones, and only while on the allowlist.
create policy "push_subscriptions_select" on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid() and public.is_allowed());
create policy "push_subscriptions_insert" on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowed());
create policy "push_subscriptions_update" on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid() and public.is_allowed()) with check (user_id = auth.uid() and public.is_allowed());
create policy "push_subscriptions_delete" on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid() and public.is_allowed());
