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
  keyword                text not null check (
                           char_length(keyword) between 1 and 80
                         ),
  keyword_normalized     text not null check (
                           char_length(keyword_normalized) between 1 and 80
                         ),
  reply_text             text not null check (
                           char_length(reply_text) between 1 and 4096
                         ),
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

comment on table public.telegram_keyword_automations is
  'Exact-match Telegram keywords and owner-written prepared replies.';

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
