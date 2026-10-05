-- Price-first proposals: Faith sends personalized pricing BEFORE a call;
-- the client can request add-ons from that page and book a planning call
-- once they're ready. The contract still comes after, as before.
alter table public.proposals
  add column intro_note text,                                 -- Faith's personal note at the top
  add column requested_addons text[] not null default '{}',   -- see ADD_ONS in src/lib/price-list.ts
  add column addons_note text,                                -- anything the client typed with the request
  add column addons_requested_at timestamptz,
  add column addons_handled_at timestamptz;                   -- Faith marked the request as dealt with

alter table public.proposal_items
  add column note text; -- small client-facing line under an item, e.g. "If your final count is 50 or fewer..."
