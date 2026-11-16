-- A keepsake of every notification sent to the phones. Only the server (service role) writes it.
create table public.sent_notifications (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  title text not null,
  body text not null,
  tag text not null,
  -- Rebuilt afterwards from the itinerary, because the original text was never saved.
  rebuilt boolean not null default false,
  unique (sent_at, title)
);

alter table public.sent_notifications enable row level security;

create policy "sent_notifications_select" on public.sent_notifications for select to authenticated
  using (public.is_allowed());
