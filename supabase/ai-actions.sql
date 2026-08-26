-- =============================================================================
-- Pushtiban - safe AI action execution foundation
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Idempotent and non-destructive. Run after supabase/business-data.sql and
-- supabase/channel-inbox.sql.
-- =============================================================================

-- Per-business action controls. The code registry remains the source of what
-- actions exist and of all mandatory security requirements; this table can
-- only disable an action or add confirmation.
create table if not exists public.business_action_settings (
  user_id                uuid not null references auth.users (id) on delete cascade,
  action_key             text not null,
  is_enabled             boolean not null default false,
  require_confirmation   boolean not null default false,
  collection_id          uuid,
  source_id              uuid,
  related_collection_id  uuid,
  field_mapping          jsonb not null default '{}'::jsonb,
  configuration          jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (user_id, action_key),
  constraint business_action_settings_action_key_check
    check (action_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint business_action_settings_field_mapping_check
    check (
      jsonb_typeof(field_mapping) = 'object'
      and octet_length(field_mapping::text) <= 8192
      and not public.business_data_json_has_secret_key(field_mapping)
    ),
  constraint business_action_settings_configuration_check
    check (
      jsonb_typeof(configuration) = 'object'
      and octet_length(configuration::text) <= 4096
      and not public.business_data_json_has_secret_key(configuration)
    ),
  constraint business_action_settings_source_pair_check
    check (source_id is null or collection_id is not null),
  constraint business_action_settings_collection_fk
    foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id) on delete cascade,
  constraint business_action_settings_source_fk
    foreign key (source_id, collection_id, user_id)
    references public.business_data_sources (id, collection_id, user_id) on delete cascade,
  constraint business_action_settings_related_collection_fk
    foreign key (related_collection_id, user_id)
    references public.business_data_collections (id, user_id) on delete cascade
);

alter table public.business_action_settings
  add column if not exists collection_id uuid,
  add column if not exists source_id uuid,
  add column if not exists related_collection_id uuid,
  add column if not exists field_mapping jsonb not null default '{}'::jsonb,
  add column if not exists configuration jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_action_settings_field_mapping_check'
  ) then
    alter table public.business_action_settings
      add constraint business_action_settings_field_mapping_check
      check (
        jsonb_typeof(field_mapping) = 'object'
        and octet_length(field_mapping::text) <= 8192
        and not public.business_data_json_has_secret_key(field_mapping)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_action_settings_configuration_check'
  ) then
    alter table public.business_action_settings
      add constraint business_action_settings_configuration_check
      check (
        jsonb_typeof(configuration) = 'object'
        and octet_length(configuration::text) <= 4096
        and not public.business_data_json_has_secret_key(configuration)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_action_settings_source_pair_check'
  ) then
    alter table public.business_action_settings
      add constraint business_action_settings_source_pair_check
      check (source_id is null or collection_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_action_settings_collection_fk'
  ) then
    alter table public.business_action_settings
      add constraint business_action_settings_collection_fk
      foreign key (collection_id, user_id)
      references public.business_data_collections (id, user_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_action_settings_source_fk'
  ) then
    alter table public.business_action_settings
      add constraint business_action_settings_source_fk
      foreign key (source_id, collection_id, user_id)
      references public.business_data_sources (id, collection_id, user_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_action_settings_related_collection_fk'
  ) then
    alter table public.business_action_settings
      add constraint business_action_settings_related_collection_fk
      foreign key (related_collection_id, user_id)
      references public.business_data_collections (id, user_id) on delete cascade;
  end if;
end;
$$;

comment on table public.business_action_settings is
  'Tenant-owned restrictions for code-registered AI actions. It cannot grant an unregistered action or weaken registry security.';

drop trigger if exists business_action_settings_set_updated_at
  on public.business_action_settings;
create trigger business_action_settings_set_updated_at
  before update on public.business_action_settings
  for each row execute function public.set_updated_at();

alter table public.business_action_settings enable row level security;

-- Owners can manage only their own preferences through the authenticated
-- dashboard API. The webhook uses the service role and still enforces the
-- registry's authorization, verification, and confirmation requirements.
revoke all on table public.business_action_settings from public, anon;
grant select, insert, update on table public.business_action_settings to authenticated;
grant select, insert, update, delete
  on table public.business_action_settings to service_role;

drop policy if exists "Owners read their action settings"
  on public.business_action_settings;
create policy "Owners read their action settings"
  on public.business_action_settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Owners insert their action settings"
  on public.business_action_settings;
create policy "Owners insert their action settings"
  on public.business_action_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners update their action settings"
  on public.business_action_settings;
create policy "Owners update their action settings"
  on public.business_action_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.business_action_executions (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users (id) on delete cascade,
  action_key                 text not null,
  status                     text not null,
  channel                    text not null,
  connection_id              uuid not null,
  customer_identity_hash     text not null,
  conversation_key_hash      text not null,
  arguments                  jsonb not null default '{}'::jsonb,
  result                     jsonb,
  idempotency_key            text not null,
  requires_verification      boolean not null default false,
  requires_confirmation      boolean not null default false,
  confirmation_expires_at    timestamptz,
  execution_started_at       timestamptz,
  completed_at               timestamptz,
  failure_code               text,
  failure_reason             text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint business_action_executions_action_key_check
    check (action_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint business_action_executions_status_check
    check (status in ('pending_confirmation', 'executing', 'succeeded', 'failed', 'expired')),
  constraint business_action_executions_channel_check
    check (channel in ('telegram', 'instagram')),
  constraint business_action_executions_customer_hash_check
    check (customer_identity_hash ~ '^[0-9a-f]{64}$'),
  constraint business_action_executions_conversation_hash_check
    check (conversation_key_hash ~ '^[0-9a-f]{64}$'),
  constraint business_action_executions_idempotency_check
    check (idempotency_key ~ '^[0-9a-f]{64}$'),
  constraint business_action_executions_arguments_check
    check (jsonb_typeof(arguments) = 'object' and octet_length(arguments::text) <= 8000),
  constraint business_action_executions_result_check
    check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 8000)),
  constraint business_action_executions_confirmation_check
    check (
      (requires_confirmation and confirmation_expires_at is not null)
      or (not requires_confirmation and confirmation_expires_at is null)
    )
);

comment on table public.business_action_executions is
  'Server-only audit, confirmation, and idempotency state for explicitly registered business actions.';
comment on column public.business_action_executions.customer_identity_hash is
  'SHA-256 channel identity binding. Raw external customer identifiers are not stored here.';
comment on column public.business_action_executions.failure_reason is
  'Sanitized server-controlled failure summary. Never stores provider errors, secrets, or customer content.';

create unique index if not exists business_action_executions_idempotency_key
  on public.business_action_executions (user_id, idempotency_key);

create index if not exists business_action_executions_pending_lookup_idx
  on public.business_action_executions (
    user_id,
    channel,
    connection_id,
    customer_identity_hash,
    conversation_key_hash,
    created_at desc
  )
  where status = 'pending_confirmation';

create index if not exists business_action_executions_audit_idx
  on public.business_action_executions (user_id, created_at desc);

drop trigger if exists business_action_executions_set_updated_at
  on public.business_action_executions;
create trigger business_action_executions_set_updated_at
  before update on public.business_action_executions
  for each row execute function public.set_updated_at();

alter table public.business_action_executions enable row level security;

-- The action runtime is webhook/server code using the service role. Browser
-- roles receive neither table privileges nor RLS policies.
revoke all on table public.business_action_executions from public, anon, authenticated;
grant select, insert, update, delete
  on table public.business_action_executions to service_role;

-- An action handler may safely retry after a process interruption. The unique
-- execution link prevents the same action from appending the support message
-- twice while still reusing the existing support inbox architecture.
alter table public.support_messages
  add column if not exists action_execution_id uuid
    references public.business_action_executions (id) on delete set null;

create unique index if not exists support_messages_action_execution_key
  on public.support_messages (action_execution_id)
  where action_execution_id is not null;
