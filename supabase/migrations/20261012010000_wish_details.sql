-- Shopping list items get a description, a link and photos (each photo has a caption and its own tick).
alter table public.wishlist
  add column notes text not null default '' check (length(notes) <= 2000),
  add column url text check (url is null or length(url) <= 500);

alter table public.files drop constraint files_kind_check;
alter table public.files add constraint files_kind_check check (kind in ('ticket', 'receipt', 'photo', 'wish'));
alter table public.files add column wish_id uuid references public.wishlist (id) on delete cascade;
create index files_wish_id on public.files (wish_id);

-- "Name — details" labels (the old two-line trick) become a title plus a description.
update public.wishlist
set notes = substr(label, strpos(label, ' — ') + 3),
    label = substr(label, 1, strpos(label, ' — ') - 1)
where strpos(label, ' — ') > 1;
