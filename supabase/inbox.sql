-- =============================================================================
-- Pushtiban — Support inbox: human handoff for the AI assistant
-- Paste and run this whole file in Supabase Dashboard → SQL Editor.
-- Idempotent — safe to run multiple times.
-- Requires: supabase/onboarding.sql (creates telegram_connections).
--
-- What this adds:
--   1. Columns on telegram_connections: owner_telegram_id, owner_linked_at —
--      so the bot knows where to DM the owner when a support request arrives.
--   2. public.bot_admins — additional humans (besides the owner) who can
--      receive support requests and reply. Owner adds them by Telegram id.
--   3. public.support_conversations — one row per customer thread that needs
--      human attention. Lifecycle: open → answered → closed (or dismissed).
--   4. public.support_messages — full transcript for each conversation
--      (customer / owner / assistant / system).
--   5. public.pending_owner_replies — short-lived rows that remember "the
--      owner tapped Reply on conversation X, so their next plain message to
--      the bot is the answer" (expires after 5 minutes).
--   6. RLS on all tables — owner sees only their own support data.
-- =============================================================================

-- 1) Extend telegram_connections with owner's personal Telegram id ----------
-- The owner links their personal Telegram to the bot via a deep-link /start
-- payload (magic link generated in the dashboard). The webhook captures
-- from.id and writes it here.
alter table public.telegram_connections
  add column if not exists owner_telegram_id bigint;
alter table public.telegram_connections
  add column if not exists owner_linked_at timestamptz;

comment on column public.telegram_connections.owner_telegram_id is
  'The owner''s personal Telegram numeric id — the bot DMs them here when a support request arrives.';

-- 2) bot_admins --------------------------------------------------------------
-- Extra humans the owner trusts to answer support requests. Each admin is
-- linked by their Telegram numeric id; the webhook recognizes incoming
-- messages from these ids as admin actions.
create table if not exists public.bot_admins (
  id                  uuid primary key default gen_random_uuid(),
  telegram_connection_id uuid not null references public.telegram_connections (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  admin_telegram_id   bigint not null,
  admin_display_name  text,
  created_at          timestamptz not null default now()
);

comment on table public.bot_admins is
  'Additional humans (besides the owner) authorized to receive and answer support requests via Telegram.';

-- One admin per (connection, telegram_id) — prevents duplicates.
create unique index if not exists bot_admins_connection_telegram_id_key
  on public.bot_admins (telegram_connection_id, admin_telegram_id);

-- Speed up the webhook's "is this from an admin?" lookup.
create index if not exists bot_admins_telegram_id_idx
  on public.bot_admins (admin_telegram_id);

-- 3) support_conversations ---------------------------------------------------
-- One row per customer thread needing human attention. The webhook creates
-- this when (a) AI is unsure and the customer taps "ask admin", or (b) the
-- customer explicitly asks for a human.
create table if not exists public.support_conversations (
  id                      uuid primary key default gen_random_uuid(),
  telegram_connection_id  uuid not null references public.telegram_connections (id) on delete cascade,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  customer_telegram_id    bigint not null,
  customer_username       text,
  customer_display_name   text,
  status                  text not null default 'open'
                          check (status in ('open', 'answered', 'closed', 'dismissed')),
  queued_reason           text not null default 'ai_unknown'
                          check (queued_reason in ('ai_unknown', 'customer_request', 'ai_disabled', 'frustration')),
  last_customer_message_text  text,
  last_customer_message_at    timestamptz,
  assigned_admin_telegram_id  bigint,  -- which owner/admin is handling it (nullable = not yet claimed)
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.support_conversations is
  'Customer threads that need human attention. Single source of truth for the website inbox and the Telegram mirror.';

create index if not exists support_conversations_owner_idx
  on public.support_conversations (user_id, status, last_customer_message_at desc);
create index if not exists support_conversations_customer_idx
  on public.support_conversations (telegram_connection_id, customer_telegram_id, status);
create index if not exists support_conversations_admin_idx
  on public.support_conversations (assigned_admin_telegram_id, status);

-- 4) support_messages --------------------------------------------------------
-- Full transcript. customer = the Telegram user, owner = the business
-- owner/admin replying, assistant = the AI's message, system = bot-generated
-- status messages ("پيام شما براي پشتيبان ارسال شد").
create table if not exists public.support_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.support_conversations (id) on delete cascade,
  role                text not null
                      check (role in ('customer', 'owner', 'assistant', 'system')),
  content             text not null,
  sender_telegram_id  bigint,  -- for owner/admin messages; null for customer/system
  created_at          timestamptz not null default now()
);

create index if not exists support_messages_conversation_idx
  on public.support_messages (conversation_id, created_at);

-- 5) pending_owner_replies ---------------------------------------------------
-- When the owner/admin taps "پاسخ" on a forwarded support request, we create
-- a row here. Their next plain message to the bot is captured as the reply.
-- Expires after 5 minutes (the webhook deletes rows older than 5 min on read).
create table if not exists public.pending_owner_replies (
  id                  uuid primary key default gen_random_uuid(),
  telegram_connection_id uuid not null references public.telegram_connections (id) on delete cascade,
  conversation_id     uuid not null references public.support_conversations (id) on delete cascade,
  admin_telegram_id   bigint not null,
  created_at          timestamptz not null default now()
);

create index if not exists pending_owner_replies_admin_idx
  on public.pending_owner_replies (telegram_connection_id, admin_telegram_id);

-- 6) Triggers ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_conversations_set_updated_at
  on public.support_conversations;
create trigger support_conversations_set_updated_at
  before update on public.support_conversations
  for each row execute function public.set_updated_at();

-- 7) Row Level Security -----------------------------------------------------
-- Owner (authenticated user whose user_id matches) can CRUD their own
-- support conversations, messages, and bot_admins. The webhook uses the
-- service role which bypasses RLS.

alter table public.bot_admins enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.pending_owner_replies enable row level security;

-- bot_admins: CRUD own
drop policy if exists "bot_admins: select own" on public.bot_admins;
create policy "bot_admins: select own"
  on public.bot_admins for select
  using (auth.uid() = user_id);

drop policy if exists "bot_admins: insert own" on public.bot_admins;
create policy "bot_admins: insert own"
  on public.bot_admins for insert
  with check (auth.uid() = user_id);

drop policy if exists "bot_admins: delete own" on public.bot_admins;
create policy "bot_admins: delete own"
  on public.bot_admins for delete
  using (auth.uid() = user_id);

-- support_conversations: CRUD own
drop policy if exists "support_conversations: select own" on public.support_conversations;
create policy "support_conversations: select own"
  on public.support_conversations for select
  using (auth.uid() = user_id);

drop policy if exists "support_conversations: insert own" on public.support_conversations;
create policy "support_conversations: insert own"
  on public.support_conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "support_conversations: update own" on public.support_conversations;
create policy "support_conversations: update own"
  on public.support_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "support_conversations: delete own" on public.support_conversations;
create policy "support_conversations: delete own"
  on public.support_conversations for delete
  using (auth.uid() = user_id);

-- support_messages: CRUD own (gated via conversation ownership)
drop policy if exists "support_messages: select own" on public.support_messages;
create policy "support_messages: select own"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages: insert own" on public.support_messages;
create policy "support_messages: insert own"
  on public.support_messages for insert
  with check (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages: delete own" on public.support_messages;
create policy "support_messages: delete own"
  on public.support_messages for delete
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- pending_owner_replies: server-only (service role), no user policies
-- (the webhook reads/writes these; the dashboard never needs to).

-- 8) Grants -----------------------------------------------------------------
grant select, insert, update, delete
  on table public.bot_admins to authenticated;
grant select, insert, update, delete
  on table public.support_conversations to authenticated;
grant select, insert, delete
  on table public.support_messages to authenticated;
-- pending_owner_replies is server-only (no grant to authenticated/anon).
