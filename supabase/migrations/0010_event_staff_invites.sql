-- "Ask availability" layer: lets Faith ask specific staff whether they're
-- free for an event WITHOUT putting them on the schedule. She often needs to
-- ask several people about the same day (two events at once, or picking
-- whoever lives closest to each venue) before deciding who actually works
-- it. An invite here just records "asked, and here's their answer" — the
-- real assignment (event_staff, migration 0002) is a separate, later step
-- Faith takes herself once she's seen who said yes.
create table public.event_staff_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  status text not null default 'pending', -- 'pending' | 'available' | 'unavailable'
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, staff_id)
);
create trigger event_staff_invites_set_updated_at before update on public.event_staff_invites
  for each row execute function public.set_updated_at();

alter table public.event_staff_invites enable row level security;

create policy "event_staff_invites: admin full access"
  on public.event_staff_invites for all
  using (public.is_admin())
  with check (public.is_admin());

-- A staff login can see and answer only invites addressed to their own
-- staff row — never another teammate's.
create policy "event_staff_invites: staff can read own"
  on public.event_staff_invites for select
  using (
    exists (
      select 1 from public.staff s
      where s.id = event_staff_invites.staff_id and s.user_id = auth.uid()
    )
  );

create policy "event_staff_invites: staff can respond to own"
  on public.event_staff_invites for update
  using (
    exists (
      select 1 from public.staff s
      where s.id = event_staff_invites.staff_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.staff s
      where s.id = event_staff_invites.staff_id and s.user_id = auth.uid()
    )
  );

insert into public.email_templates (name, subject, body) values
(
  'Availability Request',
  'Are you available — {{event_date}}?',
  $html$<p>Hi {{staff_first_name}},</p>
<p>Faith wants to know if you're available to work this event:</p>
<p><strong>{{event_name}}</strong> — {{event_date}}<br>
{{event_location}}</p>
<p>Log in and let her know here: <a href="{{availability_link}}">{{availability_link}}</a></p>
<p>Thanks,<br>Perfect Pours & More</p>$html$
);
