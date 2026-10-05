-- Price-first inquiries: clients fill out event details on the website
-- (instead of booking a call first), and Faith can fill in the same
-- details herself after a phone call/text. These are the answers that
-- decide pricing and staffing (e.g. a plated dinner on real dishes needs
-- more servers than a buffet on disposables).
alter table public.events
  add column service_style text,          -- see SERVICE_STYLES in src/lib/event-details.ts
  add column dishware text,               -- 'disposable' | 'real' | 'not_sure'
  add column services_interested text[] not null default '{}',
  add column extra_help text[] not null default '{}';

alter table public.leads
  add column service_style text,
  add column dishware text,
  add column services_interested text[] not null default '{}',
  add column extra_help text[] not null default '{}',
  add column message text,                -- "anything else we should know?"
  add column source text not null default 'consultation'; -- 'consultation' | 'inquiry_form'
