-- =============================================================================
-- Pushtiban — Short-term chat memory for the AI assistant
-- Paste and run this whole file in Supabase Dashboard → SQL Editor.
-- Idempotent — safe to run multiple times.
-- Requires: supabase/onboarding.sql (creates telegram_connections).
--
-- Why: every Telegram message used to reach the model on its own, so the
-- assistant re-introduced itself on every turn and could not follow up
-- ("and for two of them?"). This stores a rolling window of the last few
-- turns per chat.
--
-- The window is 30 minutes: a message that arrives more than 30 minutes after
-- the previous one starts a NEW session with no memory, and only turns from
-- the last 30 minutes are ever sent to the model. See src/lib/ai/memory.ts.
--
-- One row per (connection, chat) — updated in place, never appended to, so the
-- table stays the size of the bot's customer base rather than its traffic.
-- =============================================================================

create table if not exists public.telegram_chat_sessions (
  id                      uuid primary key default gen_random_uuid(),
  telegram_connection_id  uuid not null references public.telegram_connections (id) on delete cascade,
  chat_id                 bigint not null,
  -- [{ "role": "user" | "assistant", "text": "...", "at": <epoch ms> }, ...]
  -- Newest last. Trimmed on every write: nothing older than the window and at
  -- most a handful of turns are kept.
  turns                   jsonb not null default '[]'::jsonb,
  last_seen_at            timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

comment on table public.telegram_chat_sessions is
  'Rolling 30-minute conversation memory per Telegram chat. Written only by the webhook (service role); never read by the dashboard.';
comment on column public.telegram_chat_sessions.turns is
  'Recent turns, newest last: [{role, text, at}]. Trimmed to the session window on write.';

create unique index if not exists telegram_chat_sessions_chat_key
  on public.telegram_chat_sessions (telegram_connection_id, chat_id);

-- Supports the optional purge below.
create index if not exists telegram_chat_sessions_last_seen_idx
  on public.telegram_chat_sessions (last_seen_at);

-- Optional housekeeping. Rows are already tiny and bounded, but a chat that
-- never comes back keeps its last few turns forever; this drops anything cold
-- for a day. Schedule it with pg_cron if you want, or run it by hand.
create or replace function public.purge_stale_telegram_chat_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.telegram_chat_sessions
  where last_seen_at < now() - interval '1 day';
$$;

-- Row Level Security: server-only, exactly like pending_owner_replies. The
-- webhook uses the service role (which bypasses RLS) and no dashboard page
-- reads this table, so RLS is enabled with no policies at all.
alter table public.telegram_chat_sessions enable row level security;
