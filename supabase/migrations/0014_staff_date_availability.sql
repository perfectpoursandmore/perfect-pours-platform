-- "Ask availability for a day" -- a lighter-weight sibling to
-- event_staff_invites (migration 0010). That table asks "are you free for
-- THIS event"; this one asks "are you free on THIS DATE" once, regardless
-- of how many events land on it. Faith wants to ask a staff member about
-- 12/12 a single time even if there are three parties that day, see one
-- yes/no per person per date, and then assign whoever said yes to whichever
-- of that day's events she needs -- without a separate ask for each one.
-- Assignment itself is still the existing event_staff step; this only
-- answers "are they free that day."
create table public.staff_date_availability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  date date not null,
  status text not null default 'pending', -- 'pending' | 'available' | 'unavailable'
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, date)
);
create trigger staff_date_availability_set_updated_at before update on public.staff_date_availability
  for each row execute function public.set_updated_at();

alter table public.staff_date_availability enable row level security;

create policy "staff_date_availability: admin full access"
  on public.staff_date_availability for all
  using (public.is_admin())
  with check (public.is_admin());

-- Same pattern as event_staff_invites: a staff login only ever sees or
-- answers its own rows.
create policy "staff_date_availability: staff can read own"
  on public.staff_date_availability for select
  using (
    exists (
      select 1 from public.staff s
      where s.id = staff_date_availability.staff_id and s.user_id = auth.uid()
    )
  );

create policy "staff_date_availability: staff can respond to own"
  on public.staff_date_availability for update
  using (
    exists (
      select 1 from public.staff s
      where s.id = staff_date_availability.staff_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.staff s
      where s.id = staff_date_availability.staff_id and s.user_id = auth.uid()
    )
  );

insert into public.email_templates (name, subject, body) values
(
  'Day Availability Request',
  'Are you available -- {{date}}?',
  $html$<p>Hi {{staff_first_name}},</p>
<p>Faith wants to know if you're available to work on <strong>{{date}}</strong> (she'll confirm which event once she hears back from everyone).</p>
<p>Log in and let her know here: <a href="{{availability_link}}">{{availability_link}}</a></p>
<p>Thanks,<br>Perfect Pours & More</p>$html$
);
