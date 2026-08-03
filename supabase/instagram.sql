-- =============================================================================
-- Pushtiban — Instagram account connections (Instagram API with Instagram Login)
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Run after supabase/auth.sql (this table references auth.users).
--
-- Instagram long-lived access tokens are encrypted by the application before
-- they reach this table, using the same AES-256-GCM helper as Telegram bot
-- tokens. Like public.telegram_connections, the table has RLS enabled and
-- intentionally has no user-facing policies: only the server-side service role
-- can read or write connections.
-- =============================================================================

create table if not exists public.instagram_connections (
  id                  uuid primary key default gen_random_uuid(),
  -- One Instagram account per business account, matching the Telegram cap.
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  -- Instagram-scoped user id returned by /me. Unique so the same Instagram
  -- account cannot serve two businesses at once.
  instagram_user_id   text not null unique,
  username            text not null,
  account_name        text not null default '',
  profile_picture_url text,
  account_type        text not null default '',
  token_ciphertext    text not null,
  -- Long-lived Instagram tokens expire 60 days after issue and can only be
  -- refreshed while still valid, so the deadline has to be stored, not guessed.
  token_expires_at    timestamptz not null,
  -- Space-separated scopes actually granted, so a later feature can detect a
  -- connection made before it started asking for a permission.
  scopes              text not null default '',
  status              text not null default 'verified'
                      check (status in ('verified', 'active', 'error')),
  -- Reserved for the messaging phase, which verifies Instagram webhook
  -- deliveries the same way the Telegram webhook does.
  webhook_secret      text,
  connected_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.instagram_connections is
  'Server-managed Instagram Business account connections; token_ciphertext is AES-256-GCM encrypted.';

comment on column public.instagram_connections.token_expires_at is
  'Expiry of the long-lived token. Refreshable only while unexpired and at least 24h old.';

-- Composite unique key so future per-channel tables (automations, flows, menus)
-- can foreign-key (instagram_connection_id, user_id) and have Postgres enforce
-- that a row never points at another account's connection. This mirrors
-- telegram_connections_id_user_id_key.
create unique index if not exists instagram_connections_id_user_id_key
  on public.instagram_connections (id, user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists instagram_connections_set_updated_at
  on public.instagram_connections;
create trigger instagram_connections_set_updated_at
  before update on public.instagram_connections
  for each row execute function public.set_updated_at();

alter table public.instagram_connections enable row level security;

-- The application server uses the service role, which bypasses RLS. Keeping
-- this table policy-free prevents browser clients from reading account metadata
-- or encrypted access tokens directly.
revoke all on table public.instagram_connections from anon, authenticated;
