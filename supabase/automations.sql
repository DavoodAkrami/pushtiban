-- =============================================================================
-- Pushtiban — Telegram keyword automations
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
-- =============================================================================

alter table public.telegram_connections
  add column if not exists webhook_secret text;

create unique index if not exists telegram_connections_id_user_id_key
  on public.telegram_connections (id, user_id);

create table if not exists public.telegram_keyword_automations (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  telegram_connection_id uuid not null,
  trigger_type           text not null default 'keyword',
  keyword                text not null check (
                           char_length(keyword) between 1 and 80
                         ),
  keyword_normalized     text not null check (
                           char_length(keyword_normalized) between 1 and 80
                         ),
  reply_text             text not null check (
                           char_length(reply_text) between 1 and 4096
                         ),
  command_description    text,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint telegram_keyword_automations_connection_owner_fkey
    foreign key (telegram_connection_id, user_id)
    references public.telegram_connections (id, user_id)
    on delete cascade,
  constraint telegram_keyword_automations_connection_keyword_key
    unique (telegram_connection_id, keyword_normalized)
);

alter table public.telegram_keyword_automations
  add column if not exists trigger_type text not null default 'keyword',
  add column if not exists command_description text;

-- Preserve slash-command rules created before trigger types were introduced.
update public.telegram_keyword_automations
set trigger_type = 'command',
    command_description = coalesce(
      nullif(btrim(command_description), ''),
      'دریافت پاسخ آماده'
    )
where keyword_normalized ~ '^/[a-z0-9_]{1,32}$';

update public.telegram_keyword_automations
set command_description = null
where trigger_type = 'keyword';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'telegram_keyword_automations_trigger_type_check'
  ) then
    alter table public.telegram_keyword_automations
      add constraint telegram_keyword_automations_trigger_type_check
      check (trigger_type in ('keyword', 'command'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'telegram_keyword_automations_command_check'
  ) then
    alter table public.telegram_keyword_automations
      add constraint telegram_keyword_automations_command_check
      check (
        (trigger_type = 'keyword' and command_description is null)
        or
        (
          trigger_type = 'command'
          and keyword_normalized ~ '^/[a-z0-9_]{1,32}$'
          and char_length(command_description) between 1 and 256
        )
      );
  end if;
end;
$$;

comment on table public.telegram_keyword_automations is
  'Telegram exact-match keywords and slash commands with owner-written prepared replies.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists telegram_keyword_automations_set_updated_at
  on public.telegram_keyword_automations;
create trigger telegram_keyword_automations_set_updated_at
  before update on public.telegram_keyword_automations
  for each row execute function public.set_updated_at();

create index if not exists telegram_keyword_automations_active_lookup_idx
  on public.telegram_keyword_automations (
    telegram_connection_id,
    keyword_normalized
  )
  where is_active;

create index if not exists telegram_keyword_automations_active_trigger_lookup_idx
  on public.telegram_keyword_automations (
    telegram_connection_id,
    trigger_type,
    keyword_normalized
  )
  where is_active;

alter table public.telegram_keyword_automations enable row level security;

drop policy if exists "telegram keyword automations: read own"
  on public.telegram_keyword_automations;
create policy "telegram keyword automations: read own"
  on public.telegram_keyword_automations for select
  using (auth.uid() = user_id);

drop policy if exists "telegram keyword automations: insert own"
  on public.telegram_keyword_automations;
create policy "telegram keyword automations: insert own"
  on public.telegram_keyword_automations for insert
  with check (auth.uid() = user_id);

drop policy if exists "telegram keyword automations: update own"
  on public.telegram_keyword_automations;
create policy "telegram keyword automations: update own"
  on public.telegram_keyword_automations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "telegram keyword automations: delete own"
  on public.telegram_keyword_automations;
create policy "telegram keyword automations: delete own"
  on public.telegram_keyword_automations for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete
  on table public.telegram_keyword_automations to authenticated;
