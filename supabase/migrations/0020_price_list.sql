-- Editable price list: package tiers, what's included, staff rates and
-- descriptions, add-ons, and timing policies. Edited from Admin -> Price List.
-- One row only. Until the first save, the app uses the defaults in
-- src/lib/price-list.ts, so nothing changes for clients when this runs.
create table public.price_list (
  id boolean primary key default true check (id),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.price_list enable row level security;

-- Only Faith (admin) can read or edit it through the app. The client's
-- pricing page reads it server-side with the service key.
create policy "price_list: admin only"
  on public.price_list for all
  using (public.is_admin())
  with check (public.is_admin());
