-- =============================================================================
-- Pushtiban — Telegram reply-keyboard menu (the always-visible bot menu)
-- Paste and run in Supabase Dashboard -> SQL Editor. Idempotent.
--
-- A reply keyboard belongs to the chat, not to a message, and pressing one of
-- its buttons sends the button label back as a plain text message. So the menu
-- is stored once per Telegram connection, and each button binds a label to an
-- existing flow or prepared reply that the webhook resolves the label to.
-- =============================================================================

create table if not exists public.telegram_menus (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  telegram_connection_id  uuid not null unique,
  is_enabled              boolean not null default false,
  is_persistent           boolean not null default true,
  resize_keyboard         boolean not null default true,
  one_time_keyboard       boolean not null default false,
  input_field_placeholder text check (
                            input_field_placeholder is null
                            or char_length(input_field_placeholder) between 1 and 64
                          ),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint telegram_menus_connection_owner_fkey
    foreign key (telegram_connection_id, user_id)
    references public.telegram_connections(id, user_id)
    on delete cascade
);

create table if not exists public.telegram_menu_buttons (
  id                      uuid primary key default gen_random_uuid(),
  menu_id                 uuid not null references public.telegram_menus(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  -- Denormalized so the webhook can resolve a pressed label with a single
  -- indexed lookup, without joining through telegram_menus.
  telegram_connection_id  uuid not null,
  label                   text not null check (char_length(label) between 1 and 32),
  label_normalized        text not null check (char_length(label_normalized) between 1 and 32),
  row_index               int not null default 0,
  position                int not null default 0,
  action_type             text not null check (action_type in ('flow', 'reply')),
  flow_id                 uuid references public.automation_flows(id) on delete cascade,
  automation_id           uuid references public.telegram_keyword_automations(id) on delete cascade,
  created_at              timestamptz not null default now(),
  constraint telegram_menu_buttons_action_check check (
    (action_type = 'flow' and flow_id is not null and automation_id is null)
    or (action_type = 'reply' and automation_id is not null and flow_id is null)
  ),
  constraint telegram_menu_buttons_label_key
    unique (telegram_connection_id, label_normalized)
);

-- Flow messages can show or hide the menu as the conversation moves along.
-- 'inherit' leaves whatever keyboard the customer already has on screen.
alter table public.automation_flow_nodes
  add column if not exists keyboard_action text not null default 'inherit';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_flow_nodes_keyboard_action_check'
  ) then
    alter table public.automation_flow_nodes
      add constraint automation_flow_nodes_keyboard_action_check
      check (keyboard_action in ('inherit', 'show', 'remove'));
  end if;
end $$;

-- updated_at trigger (function already created by flows.sql; repeated here so
-- this file can be run on its own).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists telegram_menus_set_updated_at on public.telegram_menus;
create trigger telegram_menus_set_updated_at
  before update on public.telegram_menus
  for each row execute function public.set_updated_at();

-- Indexes
create index if not exists telegram_menu_buttons_lookup_idx
  on public.telegram_menu_buttons (telegram_connection_id, label_normalized);

create index if not exists telegram_menu_buttons_layout_idx
  on public.telegram_menu_buttons (menu_id, row_index, position);

-- RLS
alter table public.telegram_menus enable row level security;
alter table public.telegram_menu_buttons enable row level security;

drop policy if exists "telegram menus: read own" on public.telegram_menus;
create policy "telegram menus: read own" on public.telegram_menus
  for select using (auth.uid() = user_id);

drop policy if exists "telegram menus: insert own" on public.telegram_menus;
create policy "telegram menus: insert own" on public.telegram_menus
  for insert with check (auth.uid() = user_id);

drop policy if exists "telegram menus: update own" on public.telegram_menus;
create policy "telegram menus: update own" on public.telegram_menus
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "telegram menus: delete own" on public.telegram_menus;
create policy "telegram menus: delete own" on public.telegram_menus
  for delete using (auth.uid() = user_id);

drop policy if exists "telegram menu buttons: read own" on public.telegram_menu_buttons;
create policy "telegram menu buttons: read own" on public.telegram_menu_buttons
  for select using (auth.uid() = user_id);

drop policy if exists "telegram menu buttons: insert own" on public.telegram_menu_buttons;
create policy "telegram menu buttons: insert own" on public.telegram_menu_buttons
  for insert with check (auth.uid() = user_id);

drop policy if exists "telegram menu buttons: update own" on public.telegram_menu_buttons;
create policy "telegram menu buttons: update own" on public.telegram_menu_buttons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "telegram menu buttons: delete own" on public.telegram_menu_buttons;
create policy "telegram menu buttons: delete own" on public.telegram_menu_buttons
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.telegram_menus to authenticated;
grant select, insert, update, delete on table public.telegram_menu_buttons to authenticated;
