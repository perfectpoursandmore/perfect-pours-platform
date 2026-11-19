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

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts: admin only" on storage.objects;
create policy "receipts: admin only"
  on storage.objects for all
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());`;
