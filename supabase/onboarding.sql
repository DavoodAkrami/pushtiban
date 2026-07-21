-- =============================================================================
-- Pushtiban — Guided onboarding and Telegram connection storage
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Telegram bot tokens are encrypted by the application before they reach this
-- table. The table has RLS enabled and intentionally has no user-facing
-- policies; only the server-side service role can read or write connections.
-- =============================================================================

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists telegram_skipped_at timestamptz;

create table if not exists public.telegram_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users (id) on delete cascade,
  bot_id           text not null unique,
  bot_name         text not null,
  bot_username     text not null,
  token_ciphertext text not null,
  status           text not null default 'verified'
                   check (status in ('verified', 'active', 'error')),
  connected_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.telegram_connections is
  'Server-managed Telegram bot connections; token_ciphertext is AES-256-GCM encrypted.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists telegram_connections_set_updated_at
  on public.telegram_connections;
create trigger telegram_connections_set_updated_at
  before update on public.telegram_connections
  for each row execute function public.set_updated_at();

alter table public.telegram_connections enable row level security;

-- The application server uses the service role, which bypasses RLS. Keeping
-- this table policy-free prevents browser clients from reading bot metadata or
-- encrypted credentials directly.
revoke all on table public.telegram_connections from anon, authenticated;
