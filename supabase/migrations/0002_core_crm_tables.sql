-- Phase 2: clients, leads, events database
--
-- Design principle: sensitive data lives in its OWN table, not in extra
-- columns on a shared table. That way "staff can never see client contact
-- info or financials" is enforced by Postgres Row Level Security on the
-- table itself — never by hiding a column in the app's UI. A staff login
-- has no policy at all on the *_notes / *_financials / *_payouts / staff_details
-- tables below, so a request for them returns zero rows, full stop.

create type public.lead_status as enum (
  'new_inquiry',
  'consultation_scheduled',
  'consultation_completed',
  'quote_needed',
  'proposal_sent',
  'awaiting_decision',
  'booked',
  'lost',
  'completed_event',
  'archived'
);

create type public.event_status as enum (
  'inquiry',
  'booked',
  'completed',
  'cancelled'
);

-- ---------------------------------------------------------------------
-- CLIENTS
-- ---------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null, -- set once the client has portal login
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  preferred_contact_method text, -- 'phone' | 'email' | 'text'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- Admin-only free text: "information from texts/calls/emails/in-person conversations".
create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  note text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.client_notes enable row level security;

create policy "clients: admin full access"
  on public.clients for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "clients: read own record"
  on public.clients for select
  using (user_id = auth.uid());

-- No policy for staff -> staff selects return zero rows. This is intentional.

create policy "client_notes: admin only"
  on public.client_notes for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- LEADS  (created by the consultation booking flow, see Phase 3)
-- ---------------------------------------------------------------------

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  event_type text not null,
  event_date date,
  venue_or_address text,
  guest_count int,
  how_heard text,
  consultation_at timestamptz,
  status public.lead_status not null default 'new_inquiry',
  client_id uuid references public.clients (id), -- linked once converted to a client
  event_id uuid, -- linked once converted to an event (FK added after events table exists)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

create policy "leads: admin only"
  on public.leads for all
  using (public.is_admin())
  with check (public.is_admin());

-- The public consultation-booking form runs server-side with the service
-- role key (bypasses RLS by design) so a not-yet-authenticated prospective
-- client can create a lead. See src/app/book/ in Phase 3.

-- ---------------------------------------------------------------------
-- STAFF DIRECTORY
-- Split by sensitivity: `staff` (name/roles - staff-visible on the
-- calendar) vs `staff_details` (phone/email/pay rate/private notes -
-- admin only, never joined into anything staff can query).
-- ---------------------------------------------------------------------

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  roles text[] not null default '{}', -- e.g. {bartender, server}
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_set_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

create table public.staff_details (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  phone text,
  email text,
  pay_rate numeric(10, 2), -- default hourly rate; can be overridden per assignment
  notes text,
  updated_at timestamptz not null default now()
);
create trigger staff_details_set_updated_at before update on public.staff_details
  for each row execute function public.set_updated_at();

alter table public.staff enable row level security;
alter table public.staff_details enable row level security;

create policy "staff: admin full access"
  on public.staff for all
  using (public.is_admin())
  with check (public.is_admin());

-- Staff can see the (non-sensitive) directory: their own name plus
-- teammates' names/roles, e.g. to know who else is on an event.
create policy "staff: staff can read directory"
  on public.staff for select
  using (public.is_staff());

create policy "staff_details: admin only"
  on public.staff_details for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- EVENTS
-- Overview + the fields staff are explicitly allowed to see
-- (arrival times, location, dress code, parking/venue instructions,
-- operational notes). Nothing financial and no private admin commentary
-- lives on this table — see event_notes / event_financials below.
-- ---------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null, -- e.g. "Johnson Wedding"
  event_type text not null,
  event_date date not null,
  venue_name text,
  address_line text,
  city text,
  state text,
  zip text,
  guest_count int,
  indoor_outdoor text, -- 'indoor' | 'outdoor' | 'both'
  staff_arrival_time timestamptz,
  guest_arrival_time timestamptz,
  staff_end_time timestamptz,
  status public.event_status not null default 'inquiry',
  staff_instructions text, -- operational notes staff ARE meant to see
  dress_code text,
  parking_instructions text,
  venue_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

alter table public.leads
  add constraint leads_event_id_fkey foreign key (event_id) references public.events (id);

-- Private, admin-only notes about the event (e.g. "client providing wine").
create table public.event_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  note text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- Financial summary used for the booking-status dashboard indicators.
-- Full proposal/invoice/contract line items arrive in Phase 5; this table
-- is intentionally minimal for now and stays admin-only.
create table public.event_financials (
  event_id uuid primary key references public.events (id) on delete cascade,
  total_amount numeric(10, 2),
  deposit_amount numeric(10, 2),
  balance_amount numeric(10, 2),
  proposal_sent boolean not null default false,
  contract_signed boolean not null default false,
  deposit_paid boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger event_financials_set_updated_at before update on public.event_financials
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_notes enable row level security;
alter table public.event_financials enable row level security;

create policy "events: admin full access"
  on public.events for all
  using (public.is_admin())
  with check (public.is_admin());

-- Every active staff member sees every event — intentional, so open
-- positions are visible without individual invitations.
create policy "events: staff can read all"
  on public.events for select
  using (public.is_staff());

create policy "events: client can read own events"
  on public.events for select
  using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );

create policy "event_notes: admin only"
  on public.event_notes for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "event_financials: admin only"
  on public.event_financials for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- EVENT STAFF ASSIGNMENTS
-- Who's working an event and their role/arrival time (staff-visible),
-- separated from pay rate / payout status (admin-only, event_staff_payouts).
-- ---------------------------------------------------------------------

create table public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete set null, -- null + is_open = an unfilled position
  role text not null, -- 'bartender' | 'server' | 'captain' | 'barback' | 'setup'
  is_open boolean not null default false,
  arrival_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger event_staff_set_updated_at before update on public.event_staff
  for each row execute function public.set_updated_at();

create table public.event_staff_payouts (
  event_staff_id uuid primary key references public.event_staff (id) on delete cascade,
  hours numeric(5, 2),
  pay_rate numeric(10, 2), -- overrides staff_details.pay_rate for this assignment if set
  expected_pay numeric(10, 2) generated always as (round(coalesce(hours, 0) * coalesce(pay_rate, 0), 2)) stored,
  payout_status text not null default 'unpaid', -- 'unpaid' | 'paid'
  paid_at date,
  payment_method text,
  payment_note text,
  updated_at timestamptz not null default now()
);
create trigger event_staff_payouts_set_updated_at before update on public.event_staff_payouts
  for each row execute function public.set_updated_at();

alter table public.event_staff enable row level security;
alter table public.event_staff_payouts enable row level security;

create policy "event_staff: admin full access"
  on public.event_staff for all
  using (public.is_admin())
  with check (public.is_admin());

-- Staff need this to see who else is on an event and whether a role is open.
create policy "event_staff: staff can read all"
  on public.event_staff for select
  using (public.is_staff());

create policy "event_staff_payouts: admin only"
  on public.event_staff_payouts for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------------------

create index leads_status_idx on public.leads (status);
create index events_event_date_idx on public.events (event_date);
create index events_client_id_idx on public.events (client_id);
create index event_staff_event_id_idx on public.event_staff (event_id);
create index event_staff_staff_id_idx on public.event_staff (staff_id);
