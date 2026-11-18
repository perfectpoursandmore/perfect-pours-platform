-- One running "To do" list instead of Daily + Weekly + the dashboard notes
-- box. Faith types an item, presses Enter, and keeps going. She can give an
-- item a color if she wants (e.g. "next week" or "less important"), but
-- color is never required.
alter table public.todos
  add column if not exists color text;

-- The list_type column stays (old items keep their value) but no longer
-- splits the list; new items are saved as 'daily'.

-- Move any notes from the old "Upcoming consultations" note box onto the
-- to-do list so nothing is lost, then clear them out.
do $$
begin
  if to_regclass('public.dashboard_notes') is not null then
    insert into public.todos (list_type, item, created_by, created_at)
    select 'daily', note, created_by, created_at from public.dashboard_notes;
    delete from public.dashboard_notes;
  end if;
end $$;
