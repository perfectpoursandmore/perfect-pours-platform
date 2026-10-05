-- Two-way link between a platform event and its copy on Faith's Google
-- Calendar. Until now only consultation calls were pushed to Google; this
-- lets every booked event (and inquiries, as "HOLD:" entries) show up
-- there too, and stay updated when the event is edited, cancelled or
-- deleted here.
alter table public.events
  add column google_event_id text,
  add column google_sync_error text, -- last failure message, null when in sync
  add column google_synced_at timestamptz;
