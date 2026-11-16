-- Where each itinerary place is on the map. Looked up once in the browser, then reused.
create table public.place_cache (
  query text primary key,                 -- e.g. "Kuromon Ichiba Market, Osaka, Japan"
  status text not null check (status in ('found', 'none', 'manual')),
  lat double precision,
  lng double precision,
  label text,
  updated_at timestamptz not null default now()
);

alter table public.place_cache enable row level security;
create policy "place_cache_select" on public.place_cache for select to authenticated using (public.is_allowed());
create policy "place_cache_insert" on public.place_cache for insert to authenticated with check (public.is_allowed());
create policy "place_cache_update" on public.place_cache for update to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "place_cache_delete" on public.place_cache for delete to authenticated using (public.is_allowed());
