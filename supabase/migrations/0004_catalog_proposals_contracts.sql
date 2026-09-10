-- Phase 5: service catalog, proposals, contracts, and the secure
-- client-facing document link.

-- ---------------------------------------------------------------------
-- SERVICE CATALOG
-- ---------------------------------------------------------------------

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  default_price numeric(10, 2),
  pricing_type text not null default 'flat', -- 'flat' | 'hourly' | 'per_person' | 'per_item' | 'custom'
  active boolean not null default true,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger catalog_items_set_updated_at before update on public.catalog_items
  for each row execute function public.set_updated_at();

alter table public.catalog_items enable row level security;

create policy "catalog_items: admin only"
  on public.catalog_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- PROPOSALS
-- ---------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'draft', -- 'draft' | 'sent' | 'accepted'
  subtotal numeric(10, 2) not null default 0,
  discount_amount numeric(10, 2) not null default 0,
  fee_amount numeric(10, 2) not null default 0,
  tax_rate numeric(6, 3) not null default 0, -- percent, e.g. 8.875 — 3 decimals so combined local sales-tax rates aren't rounded off
  tax_amount numeric(10, 2) not null default 0,
  total_amount numeric(10, 2) not null default 0,
  deposit_amount numeric(10, 2) not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger proposals_set_updated_at before update on public.proposals
  for each row execute function public.set_updated_at();

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id),
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(10, 2) not null default 0,
  pricing_type text not null default 'flat',
  line_total numeric(10, 2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;

create policy "proposals: admin full access"
  on public.proposals for all
  using (public.is_admin())
  with check (public.is_admin());

-- Future-proofing for the logged-in client portal (today's secure-link flow
-- uses the service-role key and doesn't need this), kept consistent with
-- how clients/events already allow a client to read their own records.
create policy "proposals: client can read own"
  on public.proposals for select
  using (
    event_id in (
      select e.id from public.events e
      join public.clients c on c.id = e.client_id
      where c.user_id = auth.uid()
    )
  );

create policy "proposal_items: admin full access"
  on public.proposal_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "proposal_items: client can read own"
  on public.proposal_items for select
  using (
    proposal_id in (
      select p.id from public.proposals p
      join public.events e on e.id = p.event_id
      join public.clients c on c.id = e.client_id
      where c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- CONTRACTS
-- ---------------------------------------------------------------------

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null, -- markdown/plain text with {{client_name}}-style placeholders
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contract_templates_set_updated_at before update on public.contract_templates
  for each row execute function public.set_updated_at();

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  template_id uuid references public.contract_templates (id),
  rendered_body text not null, -- snapshot at generation time, so edits to the
                                -- template later never change an already-sent contract
  status text not null default 'unsent', -- 'unsent' | 'sent' | 'signed'
  version int not null default 1,
  signed_name text,
  signature_data text, -- base64 PNG from the built-in signature pad
  signed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contracts_set_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();

alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;

create policy "contract_templates: admin only"
  on public.contract_templates for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "contracts: admin full access"
  on public.contracts for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "contracts: client can read own"
  on public.contracts for select
  using (
    event_id in (
      select e.id from public.events e
      join public.clients c on c.id = e.client_id
      where c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- SECURE CLIENT DOCUMENT LINK
-- One unguessable token per event. The public /client/[token] page reads
-- through the service-role client (like /book does) rather than requiring
-- the prospective/booked client to have created a login — but the token
-- itself is what makes the link safe to email: nothing else identifies
-- the event, and nothing about OTHER events is reachable from it.
-- ---------------------------------------------------------------------

alter table public.events
  add column documents_token uuid not null default gen_random_uuid();

create unique index events_documents_token_idx on public.events (documents_token);

comment on column public.events.documents_token is
  'Unguessable token for the public proposal/contract/payment link sent to the client. Never expose events.id itself in that URL.';

-- A starter template so there's something to edit/replace immediately.
-- Faith mentioned she has her own contract to use instead — replace this
-- body from Settings -> Templates whenever it's ready; the {{variable}}
-- tokens are what the app fills in automatically when a contract is
-- generated for a specific event.
insert into public.contract_templates (name, body, active) values (
  'Standard Event Services Agreement',
$md$# Event Services Agreement

This agreement is between Perfect Pours & More ("the Company") and {{client_name}} ("the Client") for event services on {{event_date}} at {{event_location}}.

## Services

{{services_list}}

## Payment

Total amount due: {{total_amount}}
Deposit required to confirm booking: {{deposit_amount}}
Remaining balance: {{balance_amount}}, due no later than 7 days before the event date.

## Cancellation

Deposits are non-refundable. Cancellations made less than 30 days before the event forfeit the full deposit.

## Agreement

By signing below, the Client agrees to the terms of this agreement.

[Replace this starter text with your own contract language from Settings -> Templates.]
$md$,
  true
);
