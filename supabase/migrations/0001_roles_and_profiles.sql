-- Phase 1: authentication & role model
-- Every login (admin, staff, client) is a Supabase auth.users row.
-- This migration adds the `profiles` table that tags each login with a role,
-- plus the helper functions every later Row Level Security (RLS) policy relies on.

create type public.user_role as enum ('admin', 'staff', 'client');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per login (admin/staff/client). Role drives every RLS policy in this project — never trust a role passed from the client, only this table.';

-- Keep updated_at current on every change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- New Supabase auth users get a profile row automatically.
-- Role defaults to 'client' (the safest default) unless the signup flow
-- passes role via raw_user_meta_data (used for admin-created staff invites).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'client'),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by RLS policies across every table in this project.
-- SECURITY DEFINER + a fixed search_path so it can read profiles regardless
-- of the calling user's own row-level permissions on that table.
create or replace function public.current_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'staff', false);
$$;

alter table public.profiles enable row level security;

-- Everyone can read their own profile (needed to know their own role/name in the UI).
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

-- Admins can read and manage every profile.
create policy "profiles: admin read all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: admin update all"
  on public.profiles for update
  using (public.is_admin());

-- A user may update their own row (e.g. full_name, phone) via the policy below.
-- RLS alone can't restrict which *columns* change on an allowed row, so a
-- trigger backs this up: only an admin may ever change someone's role.
create policy "profiles: update own row"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a user''s role.';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();
