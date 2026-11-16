-- Shopping items can have several links, one per line in `url`.
alter table public.wishlist drop constraint wishlist_url_check;
alter table public.wishlist add constraint wishlist_url_check check (url is null or length(url) <= 4000);
