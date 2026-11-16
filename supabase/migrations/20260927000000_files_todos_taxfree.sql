-- Tickets, receipt photos and day photos (the files themselves live in the private "trip-files" bucket).
create table public.files (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ticket', 'receipt', 'photo')),
  stop_key text,                       -- a ticket for this itinerary stop (null = general, e.g. a boarding pass)
  expense_client_id uuid,              -- a receipt for this expense
  trip_day int,                        -- a photo of this trip day
  label text not null default '' check (length(label) <= 120),
  path text not null unique,           -- object path in the bucket
  mime text not null,
  created_by uuid default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);
create index files_stop_key on public.files (stop_key);

-- The "before we fly" checklist. Ticks live in public.checks as "todo:<id>".
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 160),
  due date,
  url text,
  sort int not null default 0,
  created_by uuid default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);
insert into public.todos (label, due, url, sort) values
  ('Set up the smartEX account and card', '2026-09-30', 'https://smart-ex.jp/en/', 1),
  ('Book the Shinkansen Kyoto → Tokyo (Fri 30 Oct, D + E seats)', '2026-09-30', 'https://smart-ex.jp/en/', 2),
  ('Fill in Visit Japan Web (both of us)', '2026-10-20', 'https://www.vjw.digital.go.jp/', 3),
  ('Put the hotel card charges in the Payment tab', '2026-10-22', null, 4),
  ('Sort out mobile data (eSIM or roaming)', '2026-10-22', null, 5),
  ('Add Suica / ICOCA to Apple Wallet', '2026-10-23', null, 6),
  ('Top up Wise and bring some yen cash', '2026-10-23', null, 7),
  ('Upload tickets and bookings into the app', '2026-10-23', null, 8);

-- Shopping bought tax-free, so it can be checked off at the airport kiosk.
alter table public.expenses add column tax_free boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array['files', 'todos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (public.is_allowed())', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.is_allowed())', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (public.is_allowed()) with check (public.is_allowed())', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.is_allowed())', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.files, public.todos;

-- Private bucket: only the two of us can read or write.
insert into storage.buckets (id, name, public, file_size_limit)
values ('trip-files', 'trip-files', false, 15728640)
on conflict (id) do nothing;

create policy "trip_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'trip-files' and public.is_allowed());
create policy "trip_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-files' and public.is_allowed());
create policy "trip_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'trip-files' and public.is_allowed());
