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
  'Tenant-owned restrictions and mapped destinations for code-registered AI actions. It cannot grant an unregistered action or weaken registry security.';

-- Cover the collection/source foreign keys used by saved action destinations.
-- These indexes keep deletes and relationship checks bounded as tenants add
-- more configured actions.
create index if not exists business_action_settings_collection_owner_idx
  on public.business_action_settings (collection_id, user_id)
  where collection_id is not null;
create index if not exists business_action_settings_related_collection_owner_idx
  on public.business_action_settings (related_collection_id, user_id)
  where related_collection_id is not null;
create index if not exists business_action_settings_source_collection_owner_idx
  on public.business_action_settings (source_id, collection_id, user_id)
  where source_id is not null;

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

-- Internal Business Data actions use saved owner mappings, never model-selected
-- field names. This helper validates one mapped field against the tenant-owned
-- collection before a mutation RPC reads or writes it.
create or replace function public.business_action_internal_field_key(
  p_user_id uuid,
  p_collection_id uuid,
  p_mapping jsonb,
  p_concept text,
  p_types text[],
  p_required boolean default true
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  field_key text;
begin
  if jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'Invalid internal action mapping.' using errcode = '22023';
  end if;

  field_key := nullif(btrim(p_mapping ->> p_concept), '');
  if field_key is null then
    if p_required then
      raise exception 'Missing internal action field.' using errcode = '22023';
    end if;
    return null;
  end if;

  if not exists (
    select 1
    from public.business_data_fields field_definition
    where field_definition.user_id = p_user_id
      and field_definition.collection_id = p_collection_id
      and field_definition.key = field_key
      and field_definition.data_type = any(p_types)
  ) then
    raise exception 'Invalid internal action field.' using errcode = '22023';
  end if;

  return field_key;
end;
$$;

revoke execute on function public.business_action_internal_field_key(
  uuid, uuid, jsonb, text, text[], boolean
) from public, anon, authenticated;
grant execute on function public.business_action_internal_field_key(
  uuid, uuid, jsonb, text, text[], boolean
) to service_role;

create or replace function public.business_data_check_availability_action(
  p_user_id uuid,
  p_date text,
  p_time text,
  p_party_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_collection_id uuid;
  mapping jsonb;
  date_key text;
  time_key text;
  available_key text;
  remaining_key text;
  matched_count integer;
  record_values jsonb;
  stated_available boolean;
  remaining_capacity numeric;
begin
  if p_party_size < 1 or p_party_size > 100 then
    raise exception 'Invalid requested capacity.' using errcode = '22023';
  end if;

  select setting.collection_id, setting.field_mapping
  into target_collection_id, mapping
  from public.business_action_settings setting
  join public.business_data_collections collection
    on collection.id = setting.collection_id
   and collection.user_id = setting.user_id
  where setting.user_id = p_user_id
    and setting.action_key = 'check_availability'
    and setting.source_id is null
    and setting.configuration ->> 'destination' = 'internal_business_data'
    and collection.status = 'active'
    and collection.kind in ('availability', 'reservation');

  if target_collection_id is null then
    return jsonb_build_object(
      'determined', false,
      'available', null,
      'remaining_capacity', null
    );
  end if;

  date_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'date',
    array['date', 'datetime', 'text'], true
  );
  time_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'time',
    array['date', 'datetime', 'text'], true
  );
  available_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'available',
    array['boolean', 'select', 'text'], true
  );
  remaining_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'remaining_capacity',
    array['number'], false
  );

  select count(*), jsonb_agg(record.values) -> 0
  into matched_count, record_values
  from (
    select candidate.values
    from public.business_data_records candidate
    where candidate.user_id = p_user_id
      and candidate.collection_id = target_collection_id
      and candidate.status = 'active'
      and candidate.values ->> date_key = p_date
      and candidate.values ->> time_key = p_time
    limit 2
  ) record;

  if matched_count <> 1 then
    return jsonb_build_object(
      'determined', false,
      'available', null,
      'remaining_capacity', null
    );
  end if;

  if jsonb_typeof(record_values -> available_key) = 'boolean' then
    stated_available := (record_values ->> available_key)::boolean;
  elsif jsonb_typeof(record_values -> available_key) = 'string' then
    if lower(btrim(record_values ->> available_key)) in (
      'true', 'yes', 'available', 'in stock', 'موجود', 'بله'
    ) then
      stated_available := true;
    elsif lower(btrim(record_values ->> available_key)) in (
      'false', 'no', 'unavailable', 'out of stock', 'ناموجود', 'خیر'
    ) then
      stated_available := false;
    end if;
  end if;

  if remaining_key is not null
     and jsonb_typeof(record_values -> remaining_key) = 'number' then
    remaining_capacity := greatest(
      0,
      (record_values ->> remaining_key)::numeric
    );
  end if;

  if stated_available is null then
    return jsonb_build_object(
      'determined', false,
      'available', null,
      'remaining_capacity', remaining_capacity
    );
  end if;

  return jsonb_build_object(
    'determined', true,
    'available', stated_available and (
      remaining_capacity is null or remaining_capacity >= p_party_size
    ),
    'remaining_capacity', remaining_capacity
  );
end;
$$;

revoke execute on function public.business_data_check_availability_action(
  uuid, text, text, integer
) from public, anon, authenticated;
grant execute on function public.business_data_check_availability_action(
  uuid, text, text, integer
) to service_role;

drop function if exists public.business_data_create_reservation_action(
  uuid, uuid, text, text, integer, text, text
);

create or replace function public.business_data_create_reservation_action(
  p_user_id uuid,
  p_execution_id uuid,
  p_date text,
  p_time text,
  p_party_size integer,
  p_customer_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_collection_id uuid;
  mapping jsonb;
  initial_status text;
  date_key text;
  time_key text;
  party_size_key text;
  title_key text;
  reference_key text;
  status_key text;
  reservation_reference text := 'reservation_' || replace(p_execution_id::text, '-', '');
  record_values jsonb;
  existing_reference text;
  availability_collection_id uuid;
  availability_mapping jsonb;
  availability_date_key text;
  availability_time_key text;
  available_key text;
  remaining_key text;
  availability_record_id uuid;
  availability_record_ids uuid[];
  availability_match_count integer;
  availability_values jsonb;
  stated_available boolean;
  remaining_capacity numeric;
begin
  if p_party_size < 1 or p_party_size > 100
     or p_customer_values is null
     or jsonb_typeof(p_customer_values) <> 'object'
     or octet_length(p_customer_values::text) > 8192 then
    raise exception 'Invalid reservation action input.' using errcode = '22023';
  end if;

  perform 1
  from public.business_action_executions execution
  where execution.id = p_execution_id
    and execution.user_id = p_user_id
    and execution.action_key = 'create_reservation'
    and execution.status = 'executing'
  for update;
  if not found then
    raise exception 'Reservation action execution is unavailable.' using errcode = '42501';
  end if;

  select setting.collection_id, setting.field_mapping,
         nullif(btrim(setting.configuration ->> 'initialStatus'), '')
  into target_collection_id, mapping, initial_status
  from public.business_action_settings setting
  join public.business_data_collections collection
    on collection.id = setting.collection_id
   and collection.user_id = setting.user_id
  where setting.user_id = p_user_id
    and setting.action_key = 'create_reservation'
    and setting.source_id is null
    and setting.configuration ->> 'destination' = 'internal_business_data'
    and collection.status = 'active'
    and collection.kind = 'reservation';

  if target_collection_id is null then
    raise exception 'Internal reservation configuration is unavailable.' using errcode = '22023';
  end if;

  select record.external_id into existing_reference
  from public.business_data_records record
  where record.user_id = p_user_id
    and record.collection_id = target_collection_id
    and record.external_id = reservation_reference
  limit 1;
  if existing_reference is not null then
    return jsonb_build_object('status', 'created', 'reference', existing_reference);
  end if;

  date_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'date',
    array['date', 'datetime', 'text'], true
  );
  time_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'time',
    array['date', 'datetime', 'text'], true
  );
  party_size_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'party_size', array['number'], false
  );
  status_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'status',
    array['text', 'long_text', 'select'], false
  );

  select setting.collection_id, setting.field_mapping
  into availability_collection_id, availability_mapping
  from public.business_action_settings setting
  join public.business_data_collections collection
    on collection.id = setting.collection_id
   and collection.user_id = setting.user_id
  where setting.user_id = p_user_id
    and setting.action_key = 'check_availability'
    and setting.source_id is null
    and setting.configuration ->> 'destination' = 'internal_business_data'
    and collection.status = 'active'
    and collection.kind in ('availability', 'reservation');

  if availability_collection_id is not null then
    availability_date_key := public.business_action_internal_field_key(
      p_user_id, availability_collection_id, availability_mapping, 'date',
      array['date', 'datetime', 'text'], true
    );
    availability_time_key := public.business_action_internal_field_key(
      p_user_id, availability_collection_id, availability_mapping, 'time',
      array['date', 'datetime', 'text'], true
    );
    available_key := public.business_action_internal_field_key(
      p_user_id, availability_collection_id, availability_mapping, 'available',
      array['boolean', 'select', 'text'], true
    );
    remaining_key := public.business_action_internal_field_key(
      p_user_id, availability_collection_id, availability_mapping,
      'remaining_capacity', array['number'], false
    );

    with matching_records as (
      select record.id, record.values
      from public.business_data_records record
      where record.user_id = p_user_id
        and record.collection_id = availability_collection_id
        and record.status = 'active'
        and record.values ->> availability_date_key = p_date
        and record.values ->> availability_time_key = p_time
      order by record.id
      limit 2
      for update
    )
    select count(*), array_agg(record.id order by record.id),
           jsonb_agg(record.values order by record.id) -> 0
    into availability_match_count, availability_record_ids,
         availability_values
    from matching_records record;

    if availability_match_count <> 1 then
      return jsonb_build_object('status', 'unavailable');
    end if;
    availability_record_id := availability_record_ids[1];

    if jsonb_typeof(availability_values -> available_key) = 'boolean' then
      stated_available := (availability_values ->> available_key)::boolean;
    elsif jsonb_typeof(availability_values -> available_key) = 'string' then
      stated_available := lower(btrim(availability_values ->> available_key)) in (
        'true', 'yes', 'available', 'in stock', 'موجود', 'بله'
      );
    end if;
    if stated_available is distinct from true then
      return jsonb_build_object('status', 'unavailable');
    end if;

    if remaining_key is not null then
      if jsonb_typeof(availability_values -> remaining_key) <> 'number' then
        return jsonb_build_object('status', 'unavailable');
      end if;
      remaining_capacity := (availability_values ->> remaining_key)::numeric;
      if remaining_capacity < p_party_size then
        return jsonb_build_object('status', 'unavailable');
      end if;
      update public.business_data_records
      set values = jsonb_set(
        values,
        array[remaining_key],
        to_jsonb(remaining_capacity - p_party_size),
        false
      )
      where id = availability_record_id
        and user_id = p_user_id
        and collection_id = availability_collection_id;
    end if;
  end if;

  select field_definition.key
  into title_key
  from public.business_data_fields field_definition
  where field_definition.user_id = p_user_id
    and field_definition.collection_id = target_collection_id
    and field_definition.required
    and field_definition.semantic_role = 'title'
    and (
      lower(field_definition.key) in ('title', 'summary', 'reservation_title')
      or field_definition.label like '%عنوان%'
      or field_definition.label like '%خلاصه%'
      or field_definition.label like '%شرح رزرو%'
    )
  order by field_definition.position, field_definition.key
  limit 1;
  select field_definition.key
  into reference_key
  from public.business_data_fields field_definition
  where field_definition.user_id = p_user_id
    and field_definition.collection_id = target_collection_id
    and field_definition.required
    and field_definition.semantic_role = 'reference'
  order by field_definition.position, field_definition.key
  limit 1;

  if exists (
    select 1
    from jsonb_object_keys(p_customer_values) customer_field(key)
    left join public.business_data_fields field_definition
      on field_definition.user_id = p_user_id
     and field_definition.collection_id = target_collection_id
     and field_definition.key = customer_field.key
    where field_definition.key is null
       or not field_definition.required
       or field_definition.semantic_role in ('reference', 'status', 'internal_notes')
       or customer_field.key in (
         date_key, time_key, party_size_key, status_key, title_key, reference_key
       )
  ) then
    raise exception 'Invalid reservation customer field.' using errcode = '22023';
  end if;

  if date_key = time_key then
    if not exists (
      select 1
      from public.business_data_fields field_definition
      where field_definition.user_id = p_user_id
        and field_definition.collection_id = target_collection_id
        and field_definition.key = date_key
        and field_definition.data_type = 'datetime'
    ) then
      raise exception 'Reservation date and time require separate fields or one datetime field.' using errcode = '22023';
    end if;
    record_values := p_customer_values || jsonb_build_object(
      date_key, p_date || 'T' || p_time || ':00'
    );
  else
    record_values := p_customer_values || jsonb_build_object(
      date_key, p_date,
      time_key, p_time
    );
  end if;
  if party_size_key is not null then
    record_values := record_values || jsonb_build_object(
      party_size_key, p_party_size
    );
  end if;
  if title_key is not null and not (record_values ? title_key) then
    record_values := record_values || jsonb_build_object(
      title_key, left('Reservation · ' || p_date || ' ' || p_time, 120)
    );
  end if;
  if reference_key is not null then
    record_values := record_values || jsonb_build_object(
      reference_key, reservation_reference
    );
  end if;
  if status_key is not null then
    if initial_status is null then
      raise exception 'Initial reservation status is missing.' using errcode = '22023';
    end if;
    record_values := record_values || jsonb_build_object(status_key, initial_status);
  end if;

  insert into public.business_data_records (
    user_id, collection_id, source_id, external_id, values, status
  ) values (
    p_user_id, target_collection_id, null, reservation_reference,
    record_values, 'active'
  );

  return jsonb_build_object('status', 'created', 'reference', reservation_reference);
end;
$$;

revoke execute on function public.business_data_create_reservation_action(
  uuid, uuid, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.business_data_create_reservation_action(
  uuid, uuid, text, text, integer, jsonb
) to service_role;

drop function if exists public.business_data_create_order_action(
  uuid, uuid, uuid, text, numeric, integer, text, text
);

create or replace function public.business_data_create_order_action(
  p_user_id uuid,
  p_execution_id uuid,
  p_product_record_id uuid,
  p_expected_product_reference text,
  p_expected_unit_price numeric,
  p_quantity integer,
  p_customer_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_collection_id uuid;
  product_collection_id uuid;
  mapping jsonb;
  initial_status text;
  stock_tracking_enabled boolean;
  product_name_key text;
  product_reference_key text;
  product_price_key text;
  product_currency_key text;
  product_available_key text;
  product_stock_key text;
  order_product_reference_key text;
  order_quantity_key text;
  order_unit_price_key text;
  order_total_price_key text;
  order_title_key text;
  order_reference_key text;
  order_status_key text;
  product_values jsonb;
  product_external_id text;
  product_reference text;
  product_name text;
  currency text;
  current_price numeric;
  current_stock numeric;
  stated_available boolean;
  order_reference text := 'order_' || replace(p_execution_id::text, '-', '');
  order_values jsonb;
  existing_reference text;
begin
  if p_quantity < 1 or p_quantity > 50
     or p_expected_unit_price < 0
     or char_length(btrim(p_expected_product_reference)) not between 1 and 200
     or p_customer_values is null
     or jsonb_typeof(p_customer_values) <> 'object'
     or octet_length(p_customer_values::text) > 8192 then
    raise exception 'Invalid order action input.' using errcode = '22023';
  end if;

  perform 1
  from public.business_action_executions execution
  where execution.id = p_execution_id
    and execution.user_id = p_user_id
    and execution.action_key = 'create_order'
    and execution.status = 'executing'
  for update;
  if not found then
    raise exception 'Order action execution is unavailable.' using errcode = '42501';
  end if;

  select setting.collection_id, setting.related_collection_id,
         setting.field_mapping,
         nullif(btrim(setting.configuration ->> 'initialStatus'), ''),
         case
           when jsonb_typeof(
             setting.configuration -> 'stockTrackingEnabled'
           ) = 'boolean'
             then (setting.configuration ->> 'stockTrackingEnabled')::boolean
           else true
         end
  into order_collection_id, product_collection_id, mapping,
       initial_status, stock_tracking_enabled
  from public.business_action_settings setting
  join public.business_data_collections orders
    on orders.id = setting.collection_id
   and orders.user_id = setting.user_id
  join public.business_data_collections products
    on products.id = setting.related_collection_id
   and products.user_id = setting.user_id
  where setting.user_id = p_user_id
    and setting.action_key = 'create_order'
    and setting.source_id is null
    and setting.configuration ->> 'destination' = 'internal_business_data'
    and orders.status = 'active'
    and orders.kind = 'order'
    and products.status = 'active'
    and products.kind in ('product', 'menu_item')
    and products.access_scope = 'public_catalog'
    and products.ai_enabled;

  if order_collection_id is null or product_collection_id is null then
    raise exception 'Internal order configuration is unavailable.' using errcode = '22023';
  end if;

  select record.external_id into existing_reference
  from public.business_data_records record
  where record.user_id = p_user_id
    and record.collection_id = order_collection_id
    and record.external_id = order_reference
  limit 1;
  if existing_reference is not null then
    return jsonb_build_object('status', 'created', 'reference', existing_reference);
  end if;

  product_name_key := public.business_action_internal_field_key(
    p_user_id, product_collection_id, mapping, 'product_name',
    array['text', 'long_text', 'select'], true
  );
  product_reference_key := public.business_action_internal_field_key(
    p_user_id, product_collection_id, mapping, 'product_reference',
    array['text', 'long_text', 'select'], false
  );
  product_price_key := public.business_action_internal_field_key(
    p_user_id, product_collection_id, mapping, 'product_price',
    array['number', 'currency'], true
  );
  product_currency_key := public.business_action_internal_field_key(
    p_user_id, product_collection_id, mapping, 'product_currency',
    array['text', 'long_text', 'select'], false
  );
  product_available_key := public.business_action_internal_field_key(
    p_user_id, product_collection_id, mapping, 'product_available',
    array['boolean', 'select', 'text'], false
  );
  product_stock_key := public.business_action_internal_field_key(
    p_user_id, product_collection_id, mapping, 'product_stock',
    array['number'], stock_tracking_enabled
  );

  order_product_reference_key := public.business_action_internal_field_key(
    p_user_id, order_collection_id, mapping, 'destination_product_reference',
    array['text', 'long_text', 'select'], false
  );
  order_quantity_key := public.business_action_internal_field_key(
    p_user_id, order_collection_id, mapping, 'destination_quantity',
    array['number'], false
  );
  order_unit_price_key := public.business_action_internal_field_key(
    p_user_id, order_collection_id, mapping, 'destination_unit_price',
    array['number', 'currency'], false
  );
  order_total_price_key := public.business_action_internal_field_key(
    p_user_id, order_collection_id, mapping, 'destination_total_price',
    array['number', 'currency'], false
  );
  order_status_key := public.business_action_internal_field_key(
    p_user_id, order_collection_id, mapping, 'destination_status',
    array['text', 'long_text', 'select'], false
  );

  select record.values, record.external_id
  into product_values, product_external_id
  from public.business_data_records record
  where record.id = p_product_record_id
    and record.user_id = p_user_id
    and record.collection_id = product_collection_id
    and record.status = 'active'
  for update;
  if product_values is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  product_name := nullif(btrim(product_values ->> product_name_key), '');
  product_reference := coalesce(
    case
      when product_reference_key is null then null
      else nullif(btrim(product_values ->> product_reference_key), '')
    end,
    nullif(btrim(product_external_id), ''),
    p_product_record_id::text
  );
  if product_name is null
     or product_reference is distinct from btrim(p_expected_product_reference)
     or jsonb_typeof(product_values -> product_price_key) <> 'number' then
    return jsonb_build_object('status', 'unavailable');
  end if;

  current_price := (product_values ->> product_price_key)::numeric;
  if product_currency_key is not null then
    currency := nullif(btrim(product_values ->> product_currency_key), '');
  end if;
  if current_price is distinct from p_expected_unit_price then
    return jsonb_build_object(
      'status', 'price_changed',
      'current_price', current_price,
      'currency', currency
    );
  end if;

  if product_available_key is not null then
    if jsonb_typeof(product_values -> product_available_key) = 'boolean' then
      stated_available := (product_values ->> product_available_key)::boolean;
    elsif jsonb_typeof(product_values -> product_available_key) = 'string' then
      stated_available := lower(btrim(product_values ->> product_available_key)) in (
        'true', 'yes', 'available', 'in stock', 'موجود', 'بله'
      );
    end if;
    if stated_available is distinct from true then
      return jsonb_build_object('status', 'unavailable');
    end if;
  end if;

  if stock_tracking_enabled then
    if jsonb_typeof(product_values -> product_stock_key) <> 'number' then
      return jsonb_build_object('status', 'insufficient_stock');
    end if;
    current_stock := (product_values ->> product_stock_key)::numeric;
    if current_stock < p_quantity then
      return jsonb_build_object('status', 'insufficient_stock');
    end if;
    update public.business_data_records
    set values = jsonb_set(
      values,
      array[product_stock_key],
      to_jsonb(current_stock - p_quantity),
      false
    )
    where id = p_product_record_id
      and user_id = p_user_id
      and collection_id = product_collection_id;
  end if;

  select field_definition.key
  into order_title_key
  from public.business_data_fields field_definition
  where field_definition.user_id = p_user_id
    and field_definition.collection_id = order_collection_id
    and field_definition.required
    and field_definition.semantic_role = 'title'
    and (
      lower(field_definition.key) in ('title', 'summary', 'order_title')
      or field_definition.label like '%عنوان%'
      or field_definition.label like '%خلاصه%'
      or field_definition.label like '%شرح سفارش%'
    )
  order by field_definition.position, field_definition.key
  limit 1;
  select field_definition.key
  into order_reference_key
  from public.business_data_fields field_definition
  where field_definition.user_id = p_user_id
    and field_definition.collection_id = order_collection_id
    and field_definition.required
    and field_definition.semantic_role = 'reference'
  order by field_definition.position, field_definition.key
  limit 1;

  if exists (
    select 1
    from jsonb_object_keys(p_customer_values) customer_field(key)
    left join public.business_data_fields field_definition
      on field_definition.user_id = p_user_id
     and field_definition.collection_id = order_collection_id
     and field_definition.key = customer_field.key
    where field_definition.key is null
       or not field_definition.required
       or field_definition.semantic_role in ('reference', 'status', 'internal_notes')
       or customer_field.key in (
         order_product_reference_key, order_quantity_key, order_unit_price_key,
         order_total_price_key, order_status_key, order_title_key,
         order_reference_key
       )
  ) then
    raise exception 'Invalid order customer field.' using errcode = '22023';
  end if;

  order_values := p_customer_values;
  if order_product_reference_key is not null then
    order_values := order_values || jsonb_build_object(
      order_product_reference_key, product_reference
    );
  end if;
  if order_quantity_key is not null then
    order_values := order_values || jsonb_build_object(
      order_quantity_key, p_quantity
    );
  end if;
  if order_unit_price_key is not null then
    order_values := order_values || jsonb_build_object(
      order_unit_price_key, current_price
    );
  end if;
  if order_title_key is not null and not (order_values ? order_title_key) then
    order_values := order_values || jsonb_build_object(
      order_title_key, left(product_name, 120)
    );
  end if;
  if order_reference_key is not null
     and (
       order_product_reference_key is null
       or order_reference_key <> order_product_reference_key
     ) then
    order_values := order_values || jsonb_build_object(
      order_reference_key, order_reference
    );
  end if;
  if order_total_price_key is not null then
    order_values := order_values || jsonb_build_object(
      order_total_price_key, current_price * p_quantity
    );
  end if;
  if order_status_key is not null then
    if initial_status is null then
      raise exception 'Initial order status is missing.' using errcode = '22023';
    end if;
    order_values := order_values || jsonb_build_object(
      order_status_key, initial_status
    );
  end if;

  insert into public.business_data_records (
    user_id, collection_id, source_id, external_id, values, status
  ) values (
    p_user_id, order_collection_id, null, order_reference, order_values, 'active'
  );

  return jsonb_build_object('status', 'created', 'reference', order_reference);
end;
$$;

revoke execute on function public.business_data_create_order_action(
  uuid, uuid, uuid, text, numeric, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.business_data_create_order_action(
  uuid, uuid, uuid, text, numeric, integer, jsonb
) to service_role;

create or replace function public.business_data_cancel_action(
  p_user_id uuid,
  p_execution_id uuid,
  p_action_key text,
  p_record_id uuid,
  p_channel text,
  p_connection_id uuid,
  p_customer_identity_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_collection_id uuid;
  mapping jsonb;
  cancellation_value text;
  status_key text;
  record_values jsonb;
  record_reference text;
  current_status text;
  expected_kind text;
begin
  if p_action_key not in ('cancel_order', 'cancel_reservation')
     or p_channel not in ('telegram', 'instagram')
     or p_customer_identity_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid cancellation action input.' using errcode = '22023';
  end if;
  expected_kind := case
    when p_action_key = 'cancel_order' then 'order'
    else 'reservation'
  end;

  perform 1
  from public.business_action_executions execution
  where execution.id = p_execution_id
    and execution.user_id = p_user_id
    and execution.action_key = p_action_key
    and execution.status = 'executing'
  for update;
  if not found then
    raise exception 'Cancellation execution is unavailable.' using errcode = '42501';
  end if;

  select setting.collection_id, setting.field_mapping,
         nullif(btrim(setting.configuration ->> 'cancellationValue'), '')
  into target_collection_id, mapping, cancellation_value
  from public.business_action_settings setting
  join public.business_data_collections collection
    on collection.id = setting.collection_id
   and collection.user_id = setting.user_id
  where setting.user_id = p_user_id
    and setting.action_key = p_action_key
    and setting.source_id is null
    and setting.configuration ->> 'destination' = 'internal_business_data'
    and collection.status = 'active'
    and collection.kind = expected_kind
    and collection.access_scope = 'verified_customer'
    and collection.ai_enabled;

  if target_collection_id is null
     or cancellation_value is null
     or char_length(cancellation_value) > 80 then
    raise exception 'Internal cancellation configuration is unavailable.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.business_data_verified_customer_sessions session
    where session.user_id = p_user_id
      and session.collection_id = target_collection_id
      and session.record_id = p_record_id
      and session.channel = p_channel
      and session.connection_id = p_connection_id
      and session.customer_identity_hash = p_customer_identity_hash
      and session.expires_at > now()
  ) then
    raise exception 'Verified customer session is unavailable.' using errcode = '42501';
  end if;

  status_key := public.business_action_internal_field_key(
    p_user_id, target_collection_id, mapping, 'status',
    array['text', 'long_text', 'select'], true
  );

  select record.values,
         coalesce(nullif(btrim(record.external_id), ''), record.id::text)
  into record_values, record_reference
  from public.business_data_records record
  where record.id = p_record_id
    and record.user_id = p_user_id
    and record.collection_id = target_collection_id
    and record.status = 'active'
  for update;
  if record_values is null then
    raise exception 'Verified cancellation record is unavailable.' using errcode = '42501';
  end if;

  current_status := nullif(lower(btrim(record_values ->> status_key)), '');
  if current_status = lower(cancellation_value) then
    return jsonb_build_object('status', 'cancelled', 'reference', record_reference);
  end if;
  if current_status in (
    'cancelled', 'canceled', 'completed', 'delivered', 'shipped',
    'لغو شده', 'تکمیل شده', 'تحویل شده', 'ارسال شده'
  ) then
    raise exception 'Current status does not allow cancellation.' using errcode = '55000';
  end if;

  update public.business_data_records
  set values = jsonb_set(
    values,
    array[status_key],
    to_jsonb(cancellation_value),
    false
  )
  where id = p_record_id
    and user_id = p_user_id
    and collection_id = target_collection_id;

  return jsonb_build_object('status', 'cancelled', 'reference', record_reference);
end;
$$;

revoke execute on function public.business_data_cancel_action(
  uuid, uuid, text, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.business_data_cancel_action(
  uuid, uuid, text, uuid, text, uuid, text
) to service_role;
