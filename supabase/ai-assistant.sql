-- =============================================================================
-- Pushtiban - AI assistant account settings
-- Paste and run in Supabase Dashboard -> SQL Editor. Idempotent.
-- =============================================================================

create table if not exists public.ai_assistant_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_assistant_settings is
  'Account-level AI assistant settings. Disabled by default.';

-- Human handoff: when enabled, the AI may forward questions it cannot answer
-- (and explicit customer requests to reach a human) to the owner/admins.
-- Opt-in: disabled by default so no message is escalated without consent.
alter table public.ai_assistant_settings
  add column if not exists human_handoff_enabled boolean not null default false;

comment on column public.ai_assistant_settings.human_handoff_enabled is
  'When true, the AI can escalate to the owner/admins (unanswered questions and explicit customer requests). Disabled by default.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_assistant_settings_set_updated_at
  on public.ai_assistant_settings;
create trigger ai_assistant_settings_set_updated_at
  before update on public.ai_assistant_settings
  for each row execute function public.set_updated_at();

alter table public.ai_assistant_settings enable row level security;

drop policy if exists "AI assistant settings: read own"
  on public.ai_assistant_settings;
create policy "AI assistant settings: read own"
  on public.ai_assistant_settings for select
  using (auth.uid() = user_id);

drop policy if exists "AI assistant settings: insert own"
  on public.ai_assistant_settings;
create policy "AI assistant settings: insert own"
  on public.ai_assistant_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "AI assistant settings: update own"
  on public.ai_assistant_settings;
create policy "AI assistant settings: update own"
  on public.ai_assistant_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update
  on table public.ai_assistant_settings to authenticated;
