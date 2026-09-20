-- Structured address fields on leads, mirroring events.address_line /
-- city / state / zip. Before this, the public booking form collected one
-- free-text "venue or address" line, which people would fill in as little
-- as a neighborhood name ("Bedford") -- not enough to actually find the
-- venue, and it landed as an unstructured blob on the event record once a
-- lead converted, so Faith had to re-ask for and re-enter city/state/zip
-- by hand. Splitting it into real fields lets the booking form require
-- each piece, and lets convertLeadToClientAndEvent map them straight onto
-- the matching event columns.
--
-- venue_or_address is left in place (not dropped, not backfilled) so
-- existing leads keep their original text; new bookings write to the
-- fields below instead.
alter table public.leads
  add column address_line text,
  add column city text,
  add column state text,
  add column zip text;

comment on column public.leads.venue_or_address is
  'Legacy single-line address from before address_line/city/state/zip existed. Kept for historical leads only -- new bookings write to the structured columns instead.';
