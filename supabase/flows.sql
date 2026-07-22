-- =============================================================================
-- Pushtiban — Automation flows (interactive multi-step bot conversations)
-- Paste and run in Supabase Dashboard -> SQL Editor. Idempotent.
-- =============================================================================

-- Composite unique enables the (id, user_id) FK below (also created by automations.sql).
create unique index if not exists telegram_connections_id_user_id_key
  on public.telegram_connections (id, user_id);

create table if not exists public.automation_flows (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  telegram_connection_id   uuid not null,
  trigger_type             text not null check (trigger_type in ('keyword', 'command')),
  trigger_keyword          text not null check (char_length(trigger_keyword) between 1 and 80),
  trigger_keyword_normalized text not null check (char_length(trigger_keyword_normalized) between 1 and 80),
  name                     text not null check (char_length(name) between 1 and 100),
  command_description      text check (command_description is null or char_length(command_description) between 1 and 256),
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint automation_flows_connection_owner_fkey
    foreign key (telegram_connection_id, user_id)
    references public.telegram_connections(id, user_id)
    on delete cascade,
  constraint automation_flows_connection_keyword_key
    unique (telegram_connection_id, trigger_keyword_normalized),
  constraint automation_flows_command_check check (
    (trigger_type = 'keyword' and command_description is null)
    or (trigger_type = 'command' and trigger_keyword_normalized ~ '^/[a-z0-9_]{1,32}$'
        and char_length(command_description) between 1 and 256)
  )
);

create table if not exists public.automation_flow_nodes (
  id                      uuid primary key default gen_random_uuid(),
  flow_id                 uuid not null references public.automation_flows(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  message_text            text not null check (char_length(message_text) between 1 and 4096),
  is_root                 boolean not null default false,
  replace_on_button_click boolean not null default false,
  back_button_enabled     boolean not null default false,
  back_button_label       text not null default 'بازگشت'
    check (char_length(back_button_label) between 1 and 64),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.automation_flow_nodes
  add column if not exists replace_on_button_click boolean not null default false,
  add column if not exists back_button_enabled boolean not null default false,
  add column if not exists back_button_label text not null default 'بازگشت';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_flow_nodes_back_button_label_check'
  ) then
    alter table public.automation_flow_nodes
      add constraint automation_flow_nodes_back_button_label_check
      check (char_length(back_button_label) between 1 and 64);
  end if;
end $$;

create unique index if not exists automation_flow_nodes_one_root_per_flow
  on public.automation_flow_nodes (flow_id)
  where is_root;

create table if not exists public.automation_flow_buttons (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references public.automation_flow_nodes(id) on delete cascade,
  flow_id      uuid not null references public.automation_flows(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 64),
  action_type  text not null check (action_type in ('node', 'url', 'end')),
  next_node_id uuid references public.automation_flow_nodes(id) on delete set null,
  url          text check (url is null or char_length(url) <= 2048),
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  constraint automation_flow_buttons_action_check check (
    (action_type = 'node' and next_node_id is not null and url is null)
    or (action_type = 'url' and url is not null and next_node_id is null)
    or (action_type = 'end' and next_node_id is null and url is null)
  )
);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists automation_flows_set_updated_at on public.automation_flows;
create trigger automation_flows_set_updated_at
  before update on public.automation_flows
  for each row execute function public.set_updated_at();

drop trigger if exists automation_flow_nodes_set_updated_at on public.automation_flow_nodes;
create trigger automation_flow_nodes_set_updated_at
  before update on public.automation_flow_nodes
  for each row execute function public.set_updated_at();

-- Indexes for webhook lookup
create index if not exists automation_flows_active_lookup_idx
  on public.automation_flows (telegram_connection_id, trigger_keyword_normalized)
  where is_active;

create index if not exists automation_flow_nodes_flow_idx
  on public.automation_flow_nodes (flow_id);

create index if not exists automation_flow_buttons_node_idx
  on public.automation_flow_buttons (node_id);

-- RLS
alter table public.automation_flows enable row level security;
alter table public.automation_flow_nodes enable row level security;
alter table public.automation_flow_buttons enable row level security;

drop policy if exists "automation flows: read own" on public.automation_flows;
create policy "automation flows: read own" on public.automation_flows
  for select using (auth.uid() = user_id);

drop policy if exists "automation flows: insert own" on public.automation_flows;
create policy "automation flows: insert own" on public.automation_flows
  for insert with check (auth.uid() = user_id);

drop policy if exists "automation flows: update own" on public.automation_flows;
create policy "automation flows: update own" on public.automation_flows
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "automation flows: delete own" on public.automation_flows;
create policy "automation flows: delete own" on public.automation_flows
  for delete using (auth.uid() = user_id);

drop policy if exists "automation flow nodes: read own" on public.automation_flow_nodes;
create policy "automation flow nodes: read own" on public.automation_flow_nodes
  for select using (auth.uid() = user_id);

drop policy if exists "automation flow nodes: insert own" on public.automation_flow_nodes;
create policy "automation flow nodes: insert own" on public.automation_flow_nodes
  for insert with check (auth.uid() = user_id);

drop policy if exists "automation flow nodes: update own" on public.automation_flow_nodes;
create policy "automation flow nodes: update own" on public.automation_flow_nodes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "automation flow nodes: delete own" on public.automation_flow_nodes;
create policy "automation flow nodes: delete own" on public.automation_flow_nodes
  for delete using (auth.uid() = user_id);

drop policy if exists "automation flow buttons: read own" on public.automation_flow_buttons;
create policy "automation flow buttons: read own" on public.automation_flow_buttons
  for select using (auth.uid() = user_id);

drop policy if exists "automation flow buttons: insert own" on public.automation_flow_buttons;
create policy "automation flow buttons: insert own" on public.automation_flow_buttons
  for insert with check (auth.uid() = user_id);

drop policy if exists "automation flow buttons: update own" on public.automation_flow_buttons;
create policy "automation flow buttons: update own" on public.automation_flow_buttons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "automation flow buttons: delete own" on public.automation_flow_buttons;
create policy "automation flow buttons: delete own" on public.automation_flow_buttons
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.automation_flows to authenticated;
grant select, insert, update, delete on table public.automation_flow_nodes to authenticated;
grant select, insert, update, delete on table public.automation_flow_buttons to authenticated;
