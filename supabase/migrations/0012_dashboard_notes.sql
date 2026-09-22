-- Quick, freeform notes on the admin dashboard for anything Faith wants to
-- jot down that didn't come through the normal booking flow -- a call or
-- follow-up she scheduled by text ("Call with Nicole at 1:30pm - follow
-- up"), a reminder to herself. Not tied to a lead or event; she clears each
-- one once she's handled it, same spirit as the "Needs attention" list
-- already on this dashboard.
create table public.dashboard_notes (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.dashboard_notes enable row level security;

create policy "dashboard_notes: admin only"
  on public.dashboard_notes for all
  using (public.is_admin())
  with check (public.is_admin());
