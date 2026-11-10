-- A short note Faith types next to a forwarded text or email, saying what
-- she needs to do about it ("send an invoice", "call back Thursday").
alter table public.inbox_items
  add column if not exists note text;
