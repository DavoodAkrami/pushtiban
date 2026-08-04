-- =============================================================================
-- Pushtiban — Instagram automations, DM menu, chat memory and webhook dedupe
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Run after supabase/instagram.sql (everything here hangs off
-- public.instagram_connections).
--
-- What this adds:
--   1. public.instagram_automations — every trigger-driven rule for the
--      channel: comment -> DM, DM keyword -> prepared reply, and the two story
--      triggers. One table with a trigger_type discriminator, the same shape
--      public.telegram_keyword_automations uses for keyword vs command.
--   2. public.instagram_dm_menus / _items — ice breakers (the questions shown
--      in an empty DM thread) and the persistent menu inside the thread.
--   3. public.instagram_chat_sessions — 30-minute rolling AI memory, the
--      Instagram twin of public.telegram_chat_sessions.
--   4. public.instagram_processed_events — webhook idempotency. Meta retries
--      deliveries, and a retried comment would send the customer a SECOND DM.
-- =============================================================================

-- 1) instagram_automations ---------------------------------------------------
-- Reply text is capped at 1000 characters, not Telegram's 4096: that is the
-- limit Instagram enforces on a text message, and a rule the owner cannot
-- actually send is worse than one they cannot save.
create table if not exists public.instagram_automations (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  instagram_connection_id  uuid not null,
  trigger_type             text not null,
  -- The phrase to look for. Null only for story_mention, which has no text of
  -- its own to match against.
  phrase                   text,
  phrase_normalized        text,
  -- Comments default to 'contains' because a customer writes «سلام قیمت چنده؟»
  -- rather than the bare keyword; DM keywords are forced to 'exact' so the two
  -- channels behave the same way for the same feature.
  match_type               text not null default 'contains',
  -- Comment rules only. Null means the rule applies to every post.
  media_id                 text,
  -- The direct message that gets sent when the rule fires.
  reply_text               text not null check (
                             char_length(reply_text) between 1 and 1000
                           ),
  -- Comment rules only. Null means no public reply is posted under the comment.
  public_reply_text        text check (
                             public_reply_text is null
                             or char_length(public_reply_text) between 1 and 1000
                           ),
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Composite FK so Postgres itself enforces that a rule never points at
  -- another account's connection. Mirrors the Telegram automations table.
  constraint instagram_automations_connection_owner_fkey
    foreign key (instagram_connection_id, user_id)
    references public.instagram_connections (id, user_id)
    on delete cascade
);

comment on table public.instagram_automations is
  'Instagram trigger rules: comment -> DM, DM keyword -> prepared reply, story mention/reply -> DM.';
comment on column public.instagram_automations.media_id is
  'Comment rules only. Null applies the rule to every post; a value scopes it to one.';
comment on column public.instagram_automations.public_reply_text is
  'Comment rules only. When set, this is also posted as a public reply under the comment.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'instagram_automations_trigger_type_check'
  ) then
    alter table public.instagram_automations
      add constraint instagram_automations_trigger_type_check
      check (trigger_type in (
        'comment', 'dm_keyword', 'story_mention', 'story_reply'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'instagram_automations_match_type_check'
  ) then
    alter table public.instagram_automations
      add constraint instagram_automations_match_type_check
      check (match_type in ('contains', 'exact'));
  end if;

  -- Per-trigger shape. Each branch spells out exactly which optional columns
  -- may be present, so an inconsistent rule cannot be written at all.
  if not exists (
    select 1 from pg_constraint
    where conname = 'instagram_automations_shape_check'
  ) then
    alter table public.instagram_automations
      add constraint instagram_automations_shape_check
      check (
        (
          trigger_type = 'comment'
          and phrase_normalized is not null
          and char_length(phrase_normalized) between 1 and 80
        )
        or
        (
          trigger_type = 'dm_keyword'
          and phrase_normalized is not null
          and char_length(phrase_normalized) between 1 and 80
          and match_type = 'exact'
          and media_id is null
          and public_reply_text is null
        )
        or
        (
          trigger_type = 'story_reply'
          and media_id is null
          and public_reply_text is null
        )
        or
        (
          -- A story mention carries no text of the customer's own, so there is
          -- nothing to match: the rule either fires on every mention or not.
          trigger_type = 'story_mention'
          and phrase is null
          and phrase_normalized is null
          and media_id is null
          and public_reply_text is null
        )
      );
  end if;
end;
$$;

-- One rule per (connection, trigger, phrase, post). coalesce() rather than a
-- plain unique constraint because null media_id ("all posts") must still
-- collide with itself, and in SQL null never equals null.
create unique index if not exists instagram_automations_rule_key
  on public.instagram_automations (
    instagram_connection_id,
    trigger_type,
    coalesce(phrase_normalized, ''),
    coalesce(media_id, '')
  );

-- The webhook's hot path: active rules for one connection and one trigger.
create index if not exists instagram_automations_active_lookup_idx
  on public.instagram_automations (
    instagram_connection_id,
    trigger_type
  )
  where is_active;

-- 2) instagram_dm_menus / instagram_dm_menu_items ----------------------------
-- Instagram's answer to the Telegram bot menu. Ice breakers are the tappable
-- questions shown in an empty thread (Meta caps them at four); the persistent
-- menu is the list behind the hamburger inside the thread. Both are pushed to
-- Meta through /me/messenger_profile, so this table is the local source of
-- truth we re-push from.
create table if not exists public.instagram_dm_menus (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  instagram_connection_id  uuid not null unique,
  ice_breakers_enabled     boolean not null default false,
  persistent_menu_enabled  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint instagram_dm_menus_connection_owner_fkey
    foreign key (instagram_connection_id, user_id)
    references public.instagram_connections (id, user_id)
    on delete cascade
);

comment on table public.instagram_dm_menus is
  'Per-connection ice breaker / persistent menu settings, mirrored to Meta via /me/messenger_profile.';

create table if not exists public.instagram_dm_menu_items (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  instagram_connection_id  uuid not null,
  kind                     text not null check (kind in ('ice_breaker', 'menu')),
  -- The question (ice breaker) or the label (menu entry) the customer taps.
  title                    text not null check (
                             char_length(title) between 1 and 80
                           ),
  -- What we send when they tap it. Same 1000-character Instagram limit.
  reply_text               text not null check (
                             char_length(reply_text) between 1 and 1000
                           ),
  position                 integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint instagram_dm_menu_items_connection_owner_fkey
    foreign key (instagram_connection_id, user_id)
    references public.instagram_connections (id, user_id)
    on delete cascade
);

comment on table public.instagram_dm_menu_items is
  'Ice breaker questions and persistent menu entries, each with the reply it sends.';

create unique index if not exists instagram_dm_menu_items_position_key
  on public.instagram_dm_menu_items (
    instagram_connection_id, kind, position
  );

create index if not exists instagram_dm_menu_items_lookup_idx
  on public.instagram_dm_menu_items (instagram_connection_id, kind, position);

-- Meta accepts at most four ice breakers. Enforced here rather than only in the
-- editor, because a fifth row would make every profile push fail with an
-- error the owner cannot act on.
create or replace function public.enforce_instagram_ice_breaker_cap()
returns trigger
language plpgsql
as $$
declare
  ice_breaker_count integer;
begin
  if new.kind <> 'ice_breaker' then
    return new;
  end if;

  select count(*) into ice_breaker_count
  from public.instagram_dm_menu_items
  where instagram_connection_id = new.instagram_connection_id
    and kind = 'ice_breaker'
    and id <> new.id;

  if ice_breaker_count >= 4 then
    raise exception 'Instagram allows at most 4 ice breakers per account';
  end if;

  return new;
end;
$$;

drop trigger if exists instagram_dm_menu_items_ice_breaker_cap
  on public.instagram_dm_menu_items;
create trigger instagram_dm_menu_items_ice_breaker_cap
  before insert or update on public.instagram_dm_menu_items
  for each row execute function public.enforce_instagram_ice_breaker_cap();

-- 3) instagram_chat_sessions -------------------------------------------------
-- The Instagram twin of public.telegram_chat_sessions: one row per customer,
-- updated in place, holding the last few turns of an open 30-minute session.
-- sender_id is TEXT, not bigint: an IGSID is a 16-17 digit opaque identifier
-- and nothing good comes of treating an identifier as a number.
create table if not exists public.instagram_chat_sessions (
  id                       uuid primary key default gen_random_uuid(),
  instagram_connection_id  uuid not null references public.instagram_connections (id) on delete cascade,
  sender_id                text not null,
  -- [{ "role": "user" | "assistant", "text": "...", "at": <epoch ms> }, ...]
  -- Newest last, trimmed to the session window on every write.
  turns                    jsonb not null default '[]'::jsonb,
  last_seen_at             timestamptz not null default now(),
  created_at               timestamptz not null default now()
);

comment on table public.instagram_chat_sessions is
  'Rolling 30-minute conversation memory per Instagram customer. Written only by the webhook (service role); never read by the dashboard.';

create unique index if not exists instagram_chat_sessions_sender_key
  on public.instagram_chat_sessions (instagram_connection_id, sender_id);

create index if not exists instagram_chat_sessions_last_seen_idx
  on public.instagram_chat_sessions (last_seen_at);

create or replace function public.purge_stale_instagram_chat_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.instagram_chat_sessions
  where last_seen_at < now() - interval '1 day';
$$;

-- 4) instagram_processed_events ----------------------------------------------
-- Webhook idempotency. Meta retries a delivery it did not get a 200 for, and
-- our own handler can fail after the DM has already gone out. Without this a
-- retried comment sends the customer a second identical DM, which reads as a
-- broken product. The key is the message `mid` or the comment id.
create table if not exists public.instagram_processed_events (
  id                       uuid primary key default gen_random_uuid(),
  instagram_connection_id  uuid not null references public.instagram_connections (id) on delete cascade,
  event_key                text not null,
  created_at               timestamptz not null default now()
);

comment on table public.instagram_processed_events is
  'One row per webhook event already handled, so Meta''s retries never send a duplicate reply.';

create unique index if not exists instagram_processed_events_key
  on public.instagram_processed_events (instagram_connection_id, event_key);

create index if not exists instagram_processed_events_created_idx
  on public.instagram_processed_events (created_at);

create or replace function public.purge_stale_instagram_processed_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.instagram_processed_events
  where created_at < now() - interval '7 days';
$$;

-- 5) Triggers ----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists instagram_automations_set_updated_at
  on public.instagram_automations;
create trigger instagram_automations_set_updated_at
  before update on public.instagram_automations
  for each row execute function public.set_updated_at();

drop trigger if exists instagram_dm_menus_set_updated_at
  on public.instagram_dm_menus;
create trigger instagram_dm_menus_set_updated_at
  before update on public.instagram_dm_menus
  for each row execute function public.set_updated_at();

drop trigger if exists instagram_dm_menu_items_set_updated_at
  on public.instagram_dm_menu_items;
create trigger instagram_dm_menu_items_set_updated_at
  before update on public.instagram_dm_menu_items
  for each row execute function public.set_updated_at();

-- 6) Row Level Security ------------------------------------------------------
-- Rules and menus are owner-editable, so they get the same read/write-own
-- policies as the Telegram automations. Chat sessions and processed events are
-- webhook-only bookkeeping: RLS on, zero policies, no grants — exactly like
-- telegram_chat_sessions and pending_owner_replies.

alter table public.instagram_automations enable row level security;
alter table public.instagram_dm_menus enable row level security;
alter table public.instagram_dm_menu_items enable row level security;
alter table public.instagram_chat_sessions enable row level security;
alter table public.instagram_processed_events enable row level security;

drop policy if exists "instagram automations: read own"
  on public.instagram_automations;
create policy "instagram automations: read own"
  on public.instagram_automations for select
  using (auth.uid() = user_id);

drop policy if exists "instagram automations: insert own"
  on public.instagram_automations;
create policy "instagram automations: insert own"
  on public.instagram_automations for insert
  with check (auth.uid() = user_id);

drop policy if exists "instagram automations: update own"
  on public.instagram_automations;
create policy "instagram automations: update own"
  on public.instagram_automations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "instagram automations: delete own"
  on public.instagram_automations;
create policy "instagram automations: delete own"
  on public.instagram_automations for delete
  using (auth.uid() = user_id);

drop policy if exists "instagram dm menus: read own"
  on public.instagram_dm_menus;
create policy "instagram dm menus: read own"
  on public.instagram_dm_menus for select
  using (auth.uid() = user_id);

drop policy if exists "instagram dm menus: insert own"
  on public.instagram_dm_menus;
create policy "instagram dm menus: insert own"
  on public.instagram_dm_menus for insert
  with check (auth.uid() = user_id);

drop policy if exists "instagram dm menus: update own"
  on public.instagram_dm_menus;
create policy "instagram dm menus: update own"
  on public.instagram_dm_menus for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "instagram dm menu items: read own"
  on public.instagram_dm_menu_items;
create policy "instagram dm menu items: read own"
  on public.instagram_dm_menu_items for select
  using (auth.uid() = user_id);

drop policy if exists "instagram dm menu items: insert own"
  on public.instagram_dm_menu_items;
create policy "instagram dm menu items: insert own"
  on public.instagram_dm_menu_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "instagram dm menu items: update own"
  on public.instagram_dm_menu_items;
create policy "instagram dm menu items: update own"
  on public.instagram_dm_menu_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "instagram dm menu items: delete own"
  on public.instagram_dm_menu_items;
create policy "instagram dm menu items: delete own"
  on public.instagram_dm_menu_items for delete
  using (auth.uid() = user_id);

-- 7) Grants ------------------------------------------------------------------
grant select, insert, update, delete
  on table public.instagram_automations to authenticated;
grant select, insert, update
  on table public.instagram_dm_menus to authenticated;
grant select, insert, update, delete
  on table public.instagram_dm_menu_items to authenticated;

-- Server-only tables: the webhook reaches them through the service role, which
-- bypasses RLS, and no browser client ever needs them.
revoke all on table public.instagram_chat_sessions from anon, authenticated;
revoke all on table public.instagram_processed_events from anon, authenticated;
