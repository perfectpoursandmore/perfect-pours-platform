-- Text inbox: client texts Faith forwards from her iPhone (via a one-tap
-- Shortcut) land here, so a "can I book you March 14?" or "can you send the
-- inventory list?" doesn't get lost in her messages. Each item is a running
-- to-do until she handles it; handling it deletes the row (same spirit as
-- dashboard_notes -- nothing piles up).
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  -- The app's best guess at what the text is asking for, so the right
  -- button is front and center. Faith can always ignore it.
  kind text not null default 'todo' check (kind in ('booking', 'send', 'todo')),
  guessed_date date,
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

create index inbox_items_created_at_idx on public.inbox_items (created_at);

alter table public.inbox_items enable row level security;

create policy "inbox_items: admin only"
  on public.inbox_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- One secret key the iPhone Shortcut sends with each text, so nobody else
-- can post into the inbox. Lives in the database (not an env var) so Faith
-- can see and reset it from Settings > Text inbox without touching Vercel.
create table public.inbox_settings (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
);

insert into public.inbox_settings (id) values (true);

alter table public.inbox_settings enable row level security;

create policy "inbox_settings: admin only"
  on public.inbox_settings for all
  using (public.is_admin())
  with check (public.is_admin());
