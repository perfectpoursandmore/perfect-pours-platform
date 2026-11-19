-- Faith's on/off switches for the Today screen extras:
--   morning_email        a 7 AM email with today's to-dos, calls and events
--   clear_done_overnight checked-off to-dos are cleared every morning
-- One row only (id is always true), same pattern as inbox_settings.
create table if not exists public.app_preferences (
  id boolean primary key default true check (id),
  morning_email boolean not null default true,
  clear_done_overnight boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_preferences (id) values (true) on conflict (id) do nothing;

alter table public.app_preferences enable row level security;

drop policy if exists "app_preferences: admin only" on public.app_preferences;
create policy "app_preferences: admin only"
  on public.app_preferences for all
  using (public.is_admin())
  with check (public.is_admin());
