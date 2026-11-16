-- The cash exchange moved to the sheet's Payment tab (one row each for Alex and Sam).
alter table public.trip_settings drop column cash_rm_paid, drop column cash_jpy_got;
