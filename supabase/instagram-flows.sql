-- =============================================================================
-- Pushtiban — Interactive flows on Instagram
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Run after supabase/flows.sql and supabase/instagram.sql.
--
-- Why: public.automation_flows was written when Telegram was the only channel,
-- so a flow belongs to telegram_connection_id and that column is NOT NULL. This
-- migration widens the table the same way supabase/channel-inbox.sql widened
-- public.support_conversations — one table, one discriminator — rather than
-- forking a parallel set of Instagram flow tables that would drift.
--
-- A flow belongs to exactly ONE channel. The two channels are not
-- interchangeable: Telegram allows 4096 characters and eight inline buttons per
-- message and can rewrite a message in place, Instagram allows 640 characters
-- and three buttons and can never edit what it has sent. A single flow serving
-- both would have to be authored for the smaller of the two and would still
-- silently lose behaviour on one of them.
--
-- Nothing is dropped and no existing row changes meaning: every current flow is
-- backfilled as channel = 'telegram' with the connection it already had.
-- =============================================================================

-- 1) automation_flows: add the channel columns --------------------------------
alter table public.automation_flows
  add column if not exists channel text not null default 'telegram';

alter table public.automation_flows
  add column if not exists instagram_connection_id uuid;

comment on column public.automation_flows.channel is
  'Which channel delivers this flow: telegram or instagram.';
comment on column public.automation_flows.instagram_connection_id is
  'The Instagram account this flow runs on. Null for Telegram flows.';

-- Composite FK, so Postgres itself enforces that a flow never points at another
-- account's connection — the same guarantee automation_flows already has for
-- telegram_connection_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_flows_instagram_connection_owner_fkey'
  ) then
    alter table public.automation_flows
      add constraint automation_flows_instagram_connection_owner_fkey
      foreign key (instagram_connection_id, user_id)
      references public.instagram_connections (id, user_id)
      on delete cascade;
  end if;
end;
$$;

-- 2) Backfill before tightening anything --------------------------------------
update public.automation_flows
set channel = 'telegram'
where channel is null;

-- 3) Relax the Telegram-only NOT NULL -----------------------------------------
-- An Instagram flow has no bot. The shape check below is what keeps a row from
-- being half-filled instead.
alter table public.automation_flows
  alter column telegram_connection_id drop not null;

-- 4) Constrain the shape ------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_flows_channel_check'
  ) then
    alter table public.automation_flows
      add constraint automation_flows_channel_check
      check (channel in ('telegram', 'instagram'));
  end if;

  -- Exactly the connection column for this row's channel, and nothing else.
  -- Instagram is keyword-only: slash commands are a Telegram feature, there is
  -- no command menu to publish them to, and a customer has no way to type one.
  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_flows_channel_shape_check'
  ) then
    alter table public.automation_flows
      add constraint automation_flows_channel_shape_check
      check (
        (
          channel = 'telegram'
          and telegram_connection_id is not null
          and instagram_connection_id is null
        )
        or
        (
          channel = 'instagram'
          and instagram_connection_id is not null
          and telegram_connection_id is null
          and trigger_type = 'keyword'
        )
      );
  end if;
end;
$$;

-- 5) One flow per keyword, per account ----------------------------------------
-- automation_flows_connection_keyword_key already does this for Telegram. It
-- cannot cover Instagram rows: their telegram_connection_id is null and in SQL
-- null never equals null, so every Instagram flow would look unique.
create unique index if not exists automation_flows_instagram_keyword_key
  on public.automation_flows (
    instagram_connection_id, trigger_keyword_normalized
  )
  where instagram_connection_id is not null;

-- The webhook's hot path: an active flow for this account and this keyword.
create index if not exists automation_flows_instagram_lookup_idx
  on public.automation_flows (
    instagram_connection_id, trigger_keyword_normalized
  )
  where is_active;

-- 6) Per-channel message and button limits ------------------------------------
-- The column checks on automation_flow_nodes / _buttons are Telegram's limits,
-- because Telegram is the wider of the two. Instagram's are enforced here, in
-- the database, for the same reason every other limit in this schema is: the
-- editor validates so the owner gets a sentence, and the table validates so a
-- rule that cannot be delivered can never be stored.
--
--   640 characters — Meta's cap on the text of a button template.
--     Applied to every Instagram node, not only ones that have buttons: a node
--     gains and loses buttons as the owner edits, and a limit that moves under
--     them is worse than one that is 360 characters too strict.
--   3 buttons, 20-character labels — Meta's cap on a button template.
--     The back button is one of the three; it is rendered as a button like any
--     other, because Instagram has nothing else to render it as.

create or replace function public.enforce_instagram_flow_node_limits()
returns trigger
language plpgsql
as $$
declare
  flow_channel text;
begin
  select channel into flow_channel
  from public.automation_flows
  where id = new.flow_id;

  if flow_channel is distinct from 'instagram' then
    return new;
  end if;

  if char_length(new.message_text) > 640 then
    raise exception 'Instagram flow messages are limited to 640 characters';
  end if;

  if new.back_button_enabled
     and char_length(new.back_button_label) > 20 then
    raise exception 'Instagram button labels are limited to 20 characters';
  end if;

  return new;
end;
$$;

drop trigger if exists automation_flow_nodes_instagram_limits
  on public.automation_flow_nodes;
create trigger automation_flow_nodes_instagram_limits
  before insert or update on public.automation_flow_nodes
  for each row execute function public.enforce_instagram_flow_node_limits();

create or replace function public.enforce_instagram_flow_button_limits()
returns trigger
language plpgsql
as $$
declare
  flow_channel text;
  sibling_count integer;
begin
  select channel into flow_channel
  from public.automation_flows
  where id = new.flow_id;

  if flow_channel is distinct from 'instagram' then
    return new;
  end if;

  if char_length(new.label) > 20 then
    raise exception 'Instagram button labels are limited to 20 characters';
  end if;

  select count(*) into sibling_count
  from public.automation_flow_buttons
  where node_id = new.node_id
    and id <> new.id;

  if sibling_count >= 3 then
    raise exception 'Instagram messages carry at most 3 buttons';
  end if;

  return new;
end;
$$;

drop trigger if exists automation_flow_buttons_instagram_limits
  on public.automation_flow_buttons;
create trigger automation_flow_buttons_instagram_limits
  before insert or update on public.automation_flow_buttons
  for each row execute function public.enforce_instagram_flow_button_limits();

-- 7) Nothing to do for RLS ----------------------------------------------------
-- automation_flows, _nodes and _buttons already carry read/insert/update/delete
-- "own row" policies from supabase/flows.sql, and they are keyed on user_id,
-- which every Instagram flow has exactly like a Telegram one.
