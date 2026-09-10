-- Phase 6: QuickBooks Online integration. Faith keeps using QuickBooks for
-- real invoicing and bookkeeping — this doesn't replace it, it drives it:
-- the app creates/sends real QuickBooks invoices for the deposit and the
-- balance, and QuickBooks itself (via QuickBooks Payments, if enabled on
-- her account) hosts the actual "Pay Now" card-collection page. This app
-- never touches card numbers.

-- ---------------------------------------------------------------------
-- QBO CONNECTION (singleton, same shape/pattern as calendar_connections)
-- ---------------------------------------------------------------------

create table public.qbo_connections (
  id boolean primary key default true,
  constraint qbo_connections_singleton check (id),

  environment text not null default 'sandbox', -- 'sandbox' | 'production'
  realm_id text, -- the connected QuickBooks company id
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  connected_by uuid references auth.users (id),
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger qbo_connections_set_updated_at before update on public.qbo_connections
  for each row execute function public.set_updated_at();

-- Seed the singleton row up front so the OAuth callback's UPDATE always has
-- a row to write into (the same bug class caught in Phase 3 — see README).
insert into public.qbo_connections (id) values (true);

alter table public.qbo_connections enable row level security;

create policy "qbo_connections: admin only"
  on public.qbo_connections for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Link each client to their QuickBooks Customer record, once created
-- ---------------------------------------------------------------------

alter table public.clients add column qbo_customer_id text;

-- ---------------------------------------------------------------------
-- Deposit + balance invoice tracking, alongside the existing booking
-- status fields on event_financials (already admin-only via its existing
-- RLS policy from Phase 2 — nothing to change there).
-- ---------------------------------------------------------------------

alter table public.event_financials
  add column deposit_invoice_id text,
  add column deposit_invoice_status text, -- 'draft' | 'sent' | 'paid'
  add column deposit_invoice_sent_at timestamptz,
  add column balance_paid boolean not null default false,
  add column balance_invoice_id text,
  add column balance_invoice_status text, -- 'draft' | 'sent' | 'paid'
  add column balance_invoice_sent_at timestamptz,
  add column qbo_sync_error text; -- last QuickBooks API error, surfaced to the admin, cleared on next success
