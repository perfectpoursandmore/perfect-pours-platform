-- Phase 10: Email templates (the same {{variable}} substitution used for
-- contracts in Phase 5, reused here) and a per-client/per-event send log.
-- Both admin-only — email content and addresses are exactly the kind of
-- client-contact data staff logins must never reach.

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null, -- HTML, with {{variable}} placeholders
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger email_templates_set_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  template_id uuid references public.email_templates (id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'sent', -- 'sent' | 'failed'
  provider_message_id text,
  error text,
  sent_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index email_log_client_id_idx on public.email_log (client_id);
create index email_log_event_id_idx on public.email_log (event_id);

alter table public.email_templates enable row level security;
alter table public.email_log enable row level security;

create policy "email_templates: admin only"
  on public.email_templates for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "email_log: admin only"
  on public.email_log for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed a couple of starter templates so there's something to send/edit
-- right away. Faith can edit the wording freely from Settings -> Email
-- Templates; these are meant as a reasonable starting point, not final copy.
insert into public.email_templates (name, subject, body) values
(
  'Consultation Confirmed',
  'Your consultation with Perfect Pours & More is confirmed',
  $html$<p>Hi {{client_name}},</p>
<p>Your consultation call is confirmed for {{consultation_datetime}}. We're looking forward to talking through your {{event_type}}!</p>
<p>If anything comes up and you need to reschedule, just reply to this email.</p>
<p>Talk soon,<br>Perfect Pours & More</p>$html$
),
(
  'Proposal & Contract Ready',
  'Your proposal and contract are ready to review',
  $html$<p>Hi {{client_name}},</p>
<p>Your proposal and contract for {{event_date}} are ready. You can review the details, see the total and deposit, and sign electronically here:</p>
<p><a href="{{secure_link}}">{{secure_link}}</a></p>
<p>Once it's signed we'll follow up with an invoice for your deposit. Let us know if you have any questions!</p>
<p>Thanks,<br>Perfect Pours & More</p>$html$
);
