-- Account credit for a client -- e.g. a $200 rain-cancellation credit that
-- expires on a given date. Admin-only, same visibility as client_notes:
-- Faith records it here so it shows on the client's page and she doesn't
-- have to remember it herself, and marks it redeemed once it's used
-- against a future booking.
create table public.client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  amount numeric(10, 2) not null,
  reason text,
  expires_on date,
  redeemed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.client_credits enable row level security;

create policy "client_credits: admin only"
  on public.client_credits for all
  using (public.is_admin())
  with check (public.is_admin());
