-- Lets Faith set booking status by hand on the Booking tab, for events
-- booked before the app existed (contract signed on paper, retainer paid
-- by Venmo, etc.). When set, this wins over the in-app contract's status.
-- Cleared automatically if the client later signs a contract in the app.
alter table public.event_financials
  add column if not exists contract_status_manual text
    check (contract_status_manual in ('unsent', 'sent', 'signed'));
