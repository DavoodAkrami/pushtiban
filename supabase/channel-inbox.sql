-- =============================================================================
-- Pushtiban — Channel-aware support inbox and per-channel assistant switches
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Run after supabase/inbox.sql, supabase/ai-assistant.sql and
-- supabase/instagram.sql.
--
-- Why: public.support_conversations was written when Telegram was the only
-- channel, so a customer is identified by customer_telegram_id and a thread
-- belongs to telegram_connection_id — both NOT NULL. An escalated Instagram DM
-- has neither. This migration widens the table instead of forking it, so the
-- inbox stays one list and one reply box regardless of where the customer is.
--
-- Nothing is dropped and no existing row changes meaning: every current row is
-- backfilled as channel = 'telegram' with the id it already had.
-- =============================================================================

-- 1) support_conversations: add the channel columns -------------------------
alter table public.support_conversations
  add column if not exists channel text not null default 'telegram';

alter table public.support_conversations
  add column if not exists instagram_connection_id uuid
    references public.instagram_connections (id) on delete cascade;

-- The canonical customer key from here on. Telegram numeric ids and Instagram
-- IGSIDs have nothing in common except that both identify one customer on one
-- connection, so the shared column is text and each channel writes its own.
alter table public.support_conversations
  add column if not exists customer_external_id text;

comment on column public.support_conversations.channel is
  'Which channel the customer is on: telegram or instagram.';
comment on column public.support_conversations.customer_external_id is
  'The customer''s id on their channel — Telegram numeric id (as text) or Instagram IGSID. Canonical; customer_telegram_id is kept only because the Telegram webhook needs a numeric chat_id.';

-- 2) Backfill before tightening anything ------------------------------------
update public.support_conversations
set customer_external_id = customer_telegram_id::text
where customer_external_id is null
  and customer_telegram_id is not null;

update public.support_conversations
set channel = 'telegram'
where channel is null;

-- 3) Relax the Telegram-only NOT NULLs --------------------------------------
-- An Instagram conversation has no bot and no numeric chat id. The check
-- constraint below is what keeps a row from being half-filled instead.
alter table public.support_conversations
  alter column telegram_connection_id drop not null;
alter table public.support_conversations
  alter column customer_telegram_id drop not null;

-- 4) Constrain the shape ----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_conversations_channel_check'
  ) then
    alter table public.support_conversations
      add constraint support_conversations_channel_check
      check (channel in ('telegram', 'instagram'));
  end if;

  -- Exactly the columns for this row's channel must be present. Telegram rows
  -- keep customer_telegram_id populated as well, because the webhook sends to a
  -- numeric chat_id and re-parsing it out of text on every reply would be
  -- gratuitous.
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_conversations_channel_shape_check'
  ) then
    alter table public.support_conversations
      add constraint support_conversations_channel_shape_check
      check (
        (
          channel = 'telegram'
          and telegram_connection_id is not null
          and customer_telegram_id is not null
          and customer_external_id is not null
        )
        or
        (
          channel = 'instagram'
          and instagram_connection_id is not null
          and customer_external_id is not null
        )
      );
  end if;
end;
$$;

-- 5) Indexes ----------------------------------------------------------------
-- The webhook's "is there already an open thread for this customer?" lookup,
-- now keyed the same way for both channels.
create index if not exists support_conversations_channel_customer_idx
  on public.support_conversations (
    channel, customer_external_id, status
  );

create index if not exists support_conversations_instagram_idx
  on public.support_conversations (instagram_connection_id, status)
  where instagram_connection_id is not null;

-- 6) ai_assistant_settings: one switch per channel --------------------------
-- is_enabled stays the master switch. These decide which connected channels it
-- actually answers on. Both default to TRUE so every existing business keeps
-- behaving exactly as it does today the moment this runs.
alter table public.ai_assistant_settings
  add column if not exists telegram_enabled boolean not null default true;
alter table public.ai_assistant_settings
  add column if not exists instagram_enabled boolean not null default true;

comment on column public.ai_assistant_settings.telegram_enabled is
  'When false, the assistant never answers Telegram messages even though is_enabled is true.';
comment on column public.ai_assistant_settings.instagram_enabled is
  'When false, the assistant never answers Instagram direct messages even though is_enabled is true.';
