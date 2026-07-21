-- =============================================================================
-- Pushtiban — Auth setup
-- Paste and run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- What it creates:
--   1. public.profiles table — one profile per user (full name, business
--      name, how they heard about us)
--   2. Trigger on auth.users — after signup, copies the signup-form metadata
--      into profiles
--   3. Row Level Security — each user can only read/update their own profile
--
-- Outside of SQL: in Dashboard → Authentication → Providers make sure
-- "Email" is enabled. If "Confirm email" is on, users must verify their
-- email after signup (the frontend supports both modes).
-- =============================================================================

-- 1) Profiles table -----------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  business_name text not null default '',
  heard_from    text not null default '',   -- google | social | friend | content | ads | other
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Pushtiban user profiles — populated from signup metadata.';

-- Keep updated_at current on every update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 2) Create a profile after signup -------------------------------------------
-- The /auth signup form sends these in raw_user_meta_data (supabase.auth.signUp
-- options.data): full_name, business_name, heard_from.
-- On conflict we backfill instead of skipping, so heard_from & co. are saved
-- even if a profile row already existed (e.g. created earlier by other code).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, business_name, heard_from)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'business_name', ''),
    coalesce(new.raw_user_meta_data ->> 'heard_from', '')
  )
  on conflict (id) do update set
    email         = excluded.email,
    full_name     = case when public.profiles.full_name     = '' then excluded.full_name     else public.profiles.full_name     end,
    business_name = case when public.profiles.business_name = '' then excluded.business_name else public.profiles.business_name end,
    heard_from    = case when public.profiles.heard_from    = '' then excluded.heard_from    else public.profiles.heard_from    end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Also sync when auth metadata is updated (covers signups confirmed later or
-- metadata written after the initial insert) — same backfill semantics.
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data, email on auth.users
  for each row execute function public.handle_new_user();

-- 3) Row Level Security -------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Inserts happen only via the trigger; no user-facing insert policy needed.
