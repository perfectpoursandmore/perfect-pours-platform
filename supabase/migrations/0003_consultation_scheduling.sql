-- Phase 3: consultation booking settings + Google Calendar connection.
-- Everything here is business configuration or credentials — admin only,
-- never readable by staff or client logins. The public booking page reads
-- this through a server-side service-role connection (see src/app/book),
-- not through a logged-in role, so no policy needs to allow anon/staff access.

create table public.consultation_settings (
  id boolean primary key default true, -- singleton row (id is always `true`)
  constraint consultation_settings_singleton check (id),

  -- One entry per weekday (0=Sunday..6=Saturday). null = unavailable that day.
  -- Shape: {"start": "10:00", "end": "16:00"} in the business's local time.
  weekly_hours jsonb not null default '{
    "0": null,
    "1": {"start": "10:00", "end": "16:00"},
    "2": {"start": "10:00", "end": "16:00"},
    "3": null,
    "4": {"start": "10:00", "end": "18:00"},
    "5": {"start": "10:00", "end": "14:00"},
    "6": null
  }'::jsonb,

  time_zone text not null default 'America/New_York',
  appointment_length_minutes int not null default 30,
  buffer_before_minutes int not null default 0,
  buffer_after_minutes int not null default 15,
  min_notice_hours int not null default 12,
  max_advance_days int not null default 60,
  vacation_mode boolean not null default false,

  updated_at timestamptz not null default now()
);

-- Seed the single settings row so the app always has one to read/update.
insert into public.consultation_settings (id) values (true);

create trigger consultation_settings_set_updated_at before update on public.consultation_settings
  for each row execute function public.set_updated_at();

-- Specific dates blocked out regardless of the weekly hours (holidays, a
-- day off, etc). Distinct from vacation_mode, which blocks everything.
create table public.consultation_blocked_dates (
  blocked_date date primary key,
  reason text,
  created_at timestamptz not null default now()
);

-- Faith's Google Calendar OAuth connection. Tokens are sensitive — this
-- table is admin-only and the tokens themselves are never sent to the
-- browser (only server code reads this table, via the service role or an
-- admin-only RLS-covered request).
create table public.calendar_connections (
  id boolean primary key default true,
  constraint calendar_connections_singleton check (id),

  provider text not null default 'google',
  google_calendar_id text not null default 'primary',
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  connected_by uuid references auth.users (id),
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger calendar_connections_set_updated_at before update on public.calendar_connections
  for each row execute function public.set_updated_at();

-- Seed the singleton row up front (all null/default until Faith connects)
-- so the OAuth callback's UPDATE always has a row to write into.
insert into public.calendar_connections (id) values (true);

alter table public.consultation_settings enable row level security;
alter table public.consultation_blocked_dates enable row level security;
alter table public.calendar_connections enable row level security;

create policy "consultation_settings: admin only"
  on public.consultation_settings for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "consultation_blocked_dates: admin only"
  on public.consultation_blocked_dates for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "calendar_connections: admin only"
  on public.calendar_connections for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.calendar_connections is
  'Google OAuth tokens for Faith''s personal calendar. Read only by server-side code (service role for the public booking flow, or an authenticated admin for the settings page) — never exposed to the browser.';
