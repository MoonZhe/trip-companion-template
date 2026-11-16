-- What a card or Wise payment actually cost in ringgit (from the bank app), when we know it.
alter table public.expenses add column charged_rm numeric(12, 2) check (charged_rm > 0);

-- Our cash exchange so far, fees included: the cash rate is cash_jpy_got / cash_rm_paid.
alter table public.trip_settings
  add column cash_rm_paid numeric(12, 2) check (cash_rm_paid > 0),
  add column cash_jpy_got numeric(12, 2) check (cash_jpy_got > 0);
