-- "Paid by" is now just whose money it was; how it was paid is its own field.
alter table public.expenses drop constraint expenses_paid_by_check;
alter table public.expenses add constraint expenses_paid_by_check check (paid_by in ('alex', 'sam'));
alter table public.expenses
  add column paid_with text not null default 'cash' check (paid_with in ('wise', 'cash', 'card'));
