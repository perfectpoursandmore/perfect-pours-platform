// Same as supabase/migrations/0028_expenses.sql. Shown on the Money pages
// until it has been run, so Faith can paste it into Supabase herself.
export const EXPENSES_SQL = `create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  store text,
  total numeric(10, 2) not null check (total >= 0),
  is_return boolean not null default false,
  note text,
  receipt_path text,
  source text not null default 'photo', -- 'photo' | 'quickbooks'
  qbo_id text unique,                    -- the QuickBooks Purchase it came from
  category text,                         -- QuickBooks category
  counts boolean not null default true,  -- false = left out (staff pay, owner draws)
  reviewed boolean not null default false, -- Faith has tagged it or said "Stock"
  created_at timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0)
);
create index if not exists expense_splits_event_idx on public.expense_splits (event_id);
create index if not exists expense_splits_expense_idx on public.expense_splits (expense_id);

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

drop policy if exists "expenses: admin only" on public.expenses;
create policy "expenses: admin only"
  on public.expenses for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "expense_splits: admin only" on public.expense_splits;
create policy "expense_splits: admin only"
  on public.expense_splits for all
  using (public.is_admin())
  with check (public.is_admin());

alter table public.qbo_connections add column if not exists expenses_synced_at timestamptz;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts: admin only" on storage.objects;
create policy "receipts: admin only"
  on storage.objects for all
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());

-- Money settings: where she drives from, how much to set aside for taxes,
-- and how often she files NY sales tax. One row only.
create table if not exists public.money_settings (
  id boolean primary key default true check (id),
  home_address text,
  home_lat double precision,
  home_lng double precision,
  set_aside_pct numeric(5, 2) not null default 25,
  sales_tax_filing text not null default 'quarterly', -- 'quarterly' | 'annual'
  updated_at timestamptz not null default now()
);
insert into public.money_settings (id) values (true) on conflict (id) do nothing;
alter table public.money_settings enable row level security;
drop policy if exists "money_settings: admin only" on public.money_settings;
create policy "money_settings: admin only"
  on public.money_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- Mileage: one round trip per event, worked out from her home address
-- (auto = true), plus any trips she adds herself (shopping runs).
create table if not exists public.mileage_trips (
  id uuid primary key default gen_random_uuid(),
  trip_date date not null,
  event_id uuid references public.events (id) on delete cascade,
  miles numeric(8, 1) not null check (miles >= 0),
  note text,
  auto boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists mileage_trips_one_auto_per_event on public.mileage_trips (event_id) where auto;
alter table public.mileage_trips enable row level security;
drop policy if exists "mileage_trips: admin only" on public.mileage_trips;
create policy "mileage_trips: admin only"
  on public.mileage_trips for all
  using (public.is_admin())
  with check (public.is_admin());`;
