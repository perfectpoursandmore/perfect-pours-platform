-- Proposal options: when a client is interested in both the package and
-- bartender only, the proposal offers both and the client picks one.
-- Lines with no option_label are always included; lines with one belong to
-- that option and only count toward the total if it's the chosen one.
alter table public.proposal_items
  add column if not exists option_label text;

alter table public.proposals
  add column if not exists chosen_option text,          -- the option_label the client (or Faith) picked
  add column if not exists option_chosen_at timestamptz;
