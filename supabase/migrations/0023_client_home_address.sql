-- A client's home address. Most clients host at home, so new events for
-- them start with this address filled in (Faith changes it when they're
-- hosting somewhere else).
alter table public.clients
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text;
