-- Daily and weekly to-do lists for the dashboard. Deliberately one simple
-- table for both lists (distinguished by list_type) rather than a habit
-- tracker or anything date-bucketed/auto-resetting: Faith asked for
-- something she adds to and checks off herself, nothing that clears
-- itself out or adds tracking overhead.
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  list_type text not null check (list_type in ('daily', 'weekly')),
  item text not null,
  is_done boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.todos enable row level security;

create policy "todos: admin only"
  on public.todos for all
  using (public.is_admin())
  with check (public.is_admin());
