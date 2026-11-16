-- Japan 2026 trip companion: schema, access rules, seed data.

create table public.allowed_emails (email text primary key);
insert into public.allowed_emails (email) values
  ('alex@example.com'),
  ('sam@example.com');

create function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null,
  spent_on date not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('JPY', 'MYR')),
  category text not null check (category in ('food', 'transport', 'activities', 'shopping', 'hotel', 'other')),
  paid_by text not null check (paid_by in ('alex', 'sam', 'cash')),
  for_whom text not null default 'shared' check (for_whom in ('shared', 'alex', 'sam')),
  note text,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

create table public.checks (
  key text primary key,
  checked_by uuid default auth.uid() references auth.users,
  checked_at timestamptz not null default now()
);

create table public.wishlist (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 120),
  sort int not null default 0,
  created_by uuid default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);
insert into public.wishlist (label, sort) values
  ('3COINS haul', 1),
  ('Japanese yoghurt in a bag', 2),
  ('Supplements & meds', 3),
  ('Sunscreen', 4),
  ('Skincare', 5);

create table public.trip_settings (
  id int primary key check (id = 1),
  cash_left_jpy numeric(12, 2) not null default 0
);
insert into public.trip_settings (id) values (1);

create table public.sheet_snapshot (
  id int primary key check (id = 1),
  data jsonb not null,
  fetched_at timestamptz not null
);

-- Row level security: only the two allowlisted people can see or change anything.
do $$
declare t text;
begin
  foreach t in array array['expenses', 'checks', 'wishlist', 'trip_settings', 'sheet_snapshot'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (public.is_allowed())', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.is_allowed())', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.is_allowed()) with check (public.is_allowed())', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_allowed())', t);
  end loop;
end $$;

alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

alter publication supabase_realtime add table public.expenses, public.checks, public.wishlist, public.trip_settings;
