-- =============================================================================
-- Pushtiban — Business Data / Structured Collections core foundation
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- This file creates the generic collection, field, record, source, credential,
-- and sync-run model plus bounded public-catalog and verified-customer assistant
-- lookup. It does not implement external connectors or product/order-specific
-- table families.
-- Run the repository's auth.sql and onboarding.sql first. This file also
-- reapplies their narrow profile-update grants as defense in depth.
-- =============================================================================

-- 1) Collections --------------------------------------------------------------

create table if not exists public.business_data_collections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  key             text not null
                  check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  name            text not null
                  check (char_length(btrim(name)) between 1 and 120),
  description     text not null default ''
                  check (char_length(description) <= 1000),
  kind            text not null default 'custom'
                  check (kind in (
                    'product', 'service', 'menu_item', 'plan', 'course',
                    'order', 'reservation', 'delivery', 'return', 'discount',
                    'branch', 'enrollment', 'schedule', 'teacher', 'room',
                    'availability', 'package', 'subscription',
                    'account_status', 'usage_billing', 'property', 'custom'
                  )),
  access_scope    text not null default 'internal'
                  check (access_scope in (
                    'public_catalog', 'verified_customer', 'internal'
                  )),
  ai_enabled      boolean not null default false,
  status          text not null default 'draft'
                  check (status in ('draft', 'active', 'paused', 'archived')),
  schema_version  integer not null default 1 check (schema_version >= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, key),
  unique (id, user_id),
  check (not ai_enabled or access_scope = 'public_catalog')
);

comment on table public.business_data_collections is
  'Tenant-owned structured datasets. Templates initialize rows here; every kind uses the same generic model.';
comment on column public.business_data_collections.access_scope is
  'public_catalog is customer-safe; verified_customer requires a future identity layer; internal is never AI-readable.';
comment on column public.business_data_collections.ai_enabled is
  'Customer-facing AI lookup is permitted only for public_catalog. Verified-customer support requires a deliberate future identity and runtime migration.';

-- 2) Field definitions --------------------------------------------------------

create table if not exists public.business_data_fields (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  collection_id   uuid not null,
  key             text not null
                  check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  label           text not null
                  check (char_length(btrim(label)) between 1 and 120),
  description     text not null default ''
                  check (char_length(description) <= 500),
  data_type       text not null
                  check (data_type in (
                    'text', 'long_text', 'number', 'currency', 'boolean',
                    'date', 'datetime', 'select', 'url'
                  )),
  semantic_role   text not null default 'custom'
                  check (semantic_role in (
                    'title', 'description', 'category', 'sku', 'price',
                    'currency', 'availability', 'status', 'reference', 'url',
                    'quantity', 'start_at', 'end_at', 'location',
                    'customer_identifier', 'tracking', 'internal_notes', 'custom'
                  )),
  required        boolean not null default false,
  searchable      boolean not null default false,
  filterable      boolean not null default false,
  ai_exposure     text not null default 'hidden'
                  check (ai_exposure in ('answer', 'filter_only', 'hidden')),
  position        integer not null default 0 check (position >= 0),
  validation      jsonb not null default '{}'::jsonb
                  check (
                    jsonb_typeof(validation) = 'object'
                    and octet_length(validation::text) <= 16384
                  ),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id)
    on delete cascade,
  unique (collection_id, key),
  unique (collection_id, position),
  unique (id, collection_id, user_id)
);

comment on table public.business_data_fields is
  'Typed field metadata for generic Business Data collections.';
comment on column public.business_data_fields.ai_exposure is
  'answer may be returned after access checks; filter_only may locate a row but is omitted from answers; hidden never reaches AI.';

-- 3) Source metadata ----------------------------------------------------------

create or replace function public.business_data_json_has_secret_key(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  item record;
  normalized_key text;
begin
  if value is null then
    return false;
  end if;

  if jsonb_typeof(value) = 'object' then
    for item in select key, nested_value from jsonb_each(value) as entry(key, nested_value)
    loop
      normalized_key := regexp_replace(lower(item.key), '[^a-z0-9]', '', 'g');
      if normalized_key ~ 'token|secret|password|credential|privatekey|connectionstring|connectionuri|authorization|apikey|bearer|certificate|dsn' then
        return true;
      end if;
      if public.business_data_json_has_secret_key(item.nested_value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(value) = 'array' then
    for item in select nested_value from jsonb_array_elements(value) as entry(nested_value)
    loop
      if public.business_data_json_has_secret_key(item.nested_value) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

revoke execute on function public.business_data_json_has_secret_key(jsonb)
  from public, anon, authenticated;
grant execute on function public.business_data_json_has_secret_key(jsonb)
  to service_role;

create table if not exists public.business_data_sources (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  collection_id         uuid not null,
  name                  text not null
                        check (char_length(btrim(name)) between 1 and 120),
  source_type           text not null default 'manual'
                        check (source_type in (
                          'manual', 'csv', 'excel', 'google_sheets', 'supabase',
                          'postgresql', 'mysql', 'mongodb', 'api', 'shopify',
                          'woocommerce', 'custom_connector'
                        )),
  status                text not null default 'pending'
                        check (status in (
                          'pending', 'ready', 'syncing', 'paused', 'error',
                          'disconnected'
                        )),
  configuration         jsonb not null default '{}'::jsonb,
  field_mapping         jsonb not null default '{}'::jsonb,
  sync_cursor           jsonb not null default '{}'::jsonb,
  sync_interval_minutes integer
                        check (sync_interval_minutes is null or sync_interval_minutes >= 5),
  next_sync_at          timestamptz,
  last_attempted_at     timestamptz,
  last_succeeded_at     timestamptz,
  last_error            text
                        check (last_error is null or char_length(last_error) <= 1000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id)
    on delete cascade,
  check (
    jsonb_typeof(configuration) = 'object'
    and octet_length(configuration::text) <= 16384
    and not public.business_data_json_has_secret_key(configuration)
  ),
  check (
    jsonb_typeof(field_mapping) = 'object'
    and octet_length(field_mapping::text) <= 16384
    and not public.business_data_json_has_secret_key(field_mapping)
  ),
  check (
    jsonb_typeof(sync_cursor) = 'object'
    and octet_length(sync_cursor::text) <= 16384
    and not public.business_data_json_has_secret_key(sync_cursor)
  ),
  unique (id, collection_id, user_id)
);

comment on table public.business_data_sources is
  'Non-secret source and synchronization metadata. Adapter credentials belong only in business_data_source_secrets.';
comment on column public.business_data_sources.last_error is
  'Sanitized operational summary only. Connector code must never copy credentials or raw response bodies here.';

-- 4) Records ------------------------------------------------------------------

create table if not exists public.business_data_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  collection_id     uuid not null,
  source_id         uuid,
  external_id       text
                    check (external_id is null or char_length(btrim(external_id)) between 1 and 200),
  subject_ref       text
                    check (subject_ref is null or char_length(btrim(subject_ref)) between 1 and 200),
  values            jsonb not null default '{}'::jsonb
                    check (
                      jsonb_typeof(values) = 'object'
                      and octet_length(values::text) <= 65536
                    ),
  search_text       text not null default ''
                    check (char_length(search_text) <= 32768),
  status            text not null default 'active'
                    check (status in ('active', 'archived')),
  checksum          text
                    check (checksum is null or char_length(checksum) <= 128),
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id)
    on delete cascade,
  foreign key (source_id, collection_id, user_id)
    references public.business_data_sources (id, collection_id, user_id)
    on delete restrict,
  unique (id, collection_id, user_id)
);

comment on table public.business_data_records is
  'Validated JSONB records whose structure is defined by business_data_fields.';
comment on column public.business_data_records.subject_ref is
  'Opaque future customer binding. It is not proof of identity and is never sufficient for private AI lookup by itself.';

create unique index if not exists business_data_records_external_id_unique
  on public.business_data_records (collection_id, external_id)
  where external_id is not null;

-- 5) Source credentials -------------------------------------------------------

create table if not exists public.business_data_source_secrets (
  source_id         uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  collection_id     uuid not null,
  secret_ciphertext text,
  token_hash        text,
  token_prefix      text
                    check (token_prefix is null or char_length(token_prefix) <= 32),
  rotated_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (source_id, collection_id, user_id)
    references public.business_data_sources (id, collection_id, user_id)
    on delete cascade,
  check (secret_ciphertext is not null or token_hash is not null),
  check (token_hash is null or char_length(token_hash) <= 200)
);

comment on table public.business_data_source_secrets is
  'Server-only encrypted connector credentials or one-way API token hashes. Browser roles have no access.';

-- 6) Synchronization runs -----------------------------------------------------

create table if not exists public.business_data_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  collection_id   uuid not null,
  source_id       uuid not null,
  status          text not null default 'pending'
                  check (status in (
                    'pending', 'running', 'succeeded', 'partial', 'failed',
                    'cancelled'
                  )),
  idempotency_key text
                  check (idempotency_key is null or char_length(idempotency_key) <= 200),
  inserted_count  integer not null default 0 check (inserted_count >= 0),
  updated_count   integer not null default 0 check (updated_count >= 0),
  skipped_count   integer not null default 0 check (skipped_count >= 0),
  failed_count    integer not null default 0 check (failed_count >= 0),
  error_summary   text
                  check (error_summary is null or char_length(error_summary) <= 1000),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (source_id, collection_id, user_id)
    references public.business_data_sources (id, collection_id, user_id)
    on delete cascade,
  check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

comment on table public.business_data_sync_runs is
  'Sanitized connector run history with a 90-day retention target. Raw payloads, authorization headers, and decrypted secrets must never be stored here.';

create unique index if not exists business_data_sync_runs_idempotency_unique
  on public.business_data_sync_runs (source_id, idempotency_key)
  where idempotency_key is not null;

-- 7) Indexes ------------------------------------------------------------------

create index if not exists business_data_collections_user_status_idx
  on public.business_data_collections (user_id, status, updated_at desc);
create index if not exists business_data_fields_collection_position_idx
  on public.business_data_fields (collection_id, position);
create index if not exists business_data_sources_collection_status_idx
  on public.business_data_sources (collection_id, status, updated_at desc);
create index if not exists business_data_records_user_status_idx
  on public.business_data_records (user_id, status, updated_at desc);
create index if not exists business_data_records_collection_status_idx
  on public.business_data_records (collection_id, status, updated_at desc);
create index if not exists business_data_records_subject_ref_idx
  on public.business_data_records (collection_id, subject_ref)
  where subject_ref is not null;
create index if not exists business_data_records_values_gin_idx
  on public.business_data_records using gin (values jsonb_path_ops);
create index if not exists business_data_sync_runs_source_created_idx
  on public.business_data_sync_runs (source_id, created_at desc);

-- 8) Timestamps, quotas, and record validation --------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_data_collections_set_updated_at
  on public.business_data_collections;
create trigger business_data_collections_set_updated_at
  before update on public.business_data_collections
  for each row execute function public.set_updated_at();

drop trigger if exists business_data_fields_set_updated_at
  on public.business_data_fields;
create trigger business_data_fields_set_updated_at
  before update on public.business_data_fields
  for each row execute function public.set_updated_at();

drop trigger if exists business_data_sources_set_updated_at
  on public.business_data_sources;
create trigger business_data_sources_set_updated_at
  before update on public.business_data_sources
  for each row execute function public.set_updated_at();

drop trigger if exists business_data_records_set_updated_at
  on public.business_data_records;
create trigger business_data_records_set_updated_at
  before update on public.business_data_records
  for each row execute function public.set_updated_at();

drop trigger if exists business_data_source_secrets_set_updated_at
  on public.business_data_source_secrets;
create trigger business_data_source_secrets_set_updated_at
  before update on public.business_data_source_secrets
  for each row execute function public.set_updated_at();

drop trigger if exists business_data_sync_runs_set_updated_at
  on public.business_data_sync_runs;
create trigger business_data_sync_runs_set_updated_at
  before update on public.business_data_sync_runs
  for each row execute function public.set_updated_at();

create or replace function public.business_data_enforce_insert_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_count bigint;
begin
  -- Serialize inserts for one tenant so concurrent imports cannot race past a
  -- count-then-insert quota check.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  if tg_table_name = 'business_data_collections' then
    select count(*) into current_count
    from public.business_data_collections
    where user_id = new.user_id;
    if current_count >= 20 then
      raise exception 'Business Data collection limit exceeded'
        using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'business_data_fields' then
    if tg_op = 'UPDATE' and new.collection_id = old.collection_id then
      return new;
    end if;
    select count(*) into current_count
    from public.business_data_fields
    where collection_id = new.collection_id;
    if current_count >= 50 then
      raise exception 'Business Data field limit exceeded'
        using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'business_data_sources' then
    if tg_op = 'UPDATE' and new.collection_id = old.collection_id then
      return new;
    end if;
    select count(*) into current_count
    from public.business_data_sources
    where collection_id = new.collection_id;
    if current_count >= 10 then
      raise exception 'Business Data source limit exceeded'
        using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'business_data_records' then
    if tg_op = 'UPDATE'
      and (old.status = 'active' or new.status <> 'active')
      and new.user_id = old.user_id then
      return new;
    end if;
    select count(*) into current_count
    from public.business_data_records
    where user_id = new.user_id and status = 'active';
    if new.status = 'active' and current_count >= 10000 then
      raise exception 'Business Data record limit exceeded'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.business_data_enforce_insert_limit()
  from public, anon, authenticated;
grant execute on function public.business_data_enforce_insert_limit()
  to service_role;

drop trigger if exists business_data_collections_insert_limit
  on public.business_data_collections;
create trigger business_data_collections_insert_limit
  before insert on public.business_data_collections
  for each row execute function public.business_data_enforce_insert_limit();

drop trigger if exists business_data_fields_insert_limit
  on public.business_data_fields;
create trigger business_data_fields_insert_limit
  before insert or update of collection_id, user_id
  on public.business_data_fields
  for each row execute function public.business_data_enforce_insert_limit();

drop trigger if exists business_data_records_insert_limit
  on public.business_data_records;
create trigger business_data_records_insert_limit
  before insert or update of status, user_id
  on public.business_data_records
  for each row execute function public.business_data_enforce_insert_limit();

drop trigger if exists business_data_sources_insert_limit
  on public.business_data_sources;
create trigger business_data_sources_insert_limit
  before insert or update of collection_id, user_id
  on public.business_data_sources
  for each row execute function public.business_data_enforce_insert_limit();

create or replace function public.business_data_validate_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  invalid_key text;
  missing_key text;
  invalid_type_key text;
begin
  select value_key into invalid_key
  from jsonb_object_keys(new.values) as value_keys(value_key)
  where not exists (
    select 1
    from public.business_data_fields field_definition
    where field_definition.collection_id = new.collection_id
      and field_definition.user_id = new.user_id
      and field_definition.key = value_key
  )
  limit 1;

  if invalid_key is not null then
    raise exception 'Unknown Business Data field: %', invalid_key
      using errcode = 'check_violation';
  end if;

  select field_definition.key into missing_key
  from public.business_data_fields field_definition
  where field_definition.collection_id = new.collection_id
    and field_definition.user_id = new.user_id
    and field_definition.required
    and (
      not new.values ? field_definition.key
      or new.values -> field_definition.key = 'null'::jsonb
      or (
        field_definition.data_type in ('text', 'long_text', 'select', 'url')
        and btrim(new.values ->> field_definition.key) = ''
      )
    )
  limit 1;

  if missing_key is not null then
    raise exception 'Required Business Data field is missing: %', missing_key
      using errcode = 'not_null_violation';
  end if;

  select field_definition.key into invalid_type_key
  from public.business_data_fields field_definition
  where field_definition.collection_id = new.collection_id
    and field_definition.user_id = new.user_id
    and new.values ? field_definition.key
    and new.values -> field_definition.key <> 'null'::jsonb
    and case
      when field_definition.data_type in (
        'text', 'long_text', 'select', 'url', 'date', 'datetime'
      ) then jsonb_typeof(new.values -> field_definition.key) <> 'string'
      when field_definition.data_type in ('number', 'currency')
        then jsonb_typeof(new.values -> field_definition.key) <> 'number'
      when field_definition.data_type = 'boolean'
        then jsonb_typeof(new.values -> field_definition.key) <> 'boolean'
      else true
    end
  limit 1;

  if invalid_type_key is not null then
    raise exception 'Invalid Business Data field type: %', invalid_type_key
      using errcode = 'check_violation';
  end if;

  -- Search text contains only fields that a future AI lookup may use. Hidden
  -- values such as customer identifiers and internal notes are excluded.
  select coalesce(
    left(
      string_agg(
        new.values ->> field_definition.key,
        ' ' order by field_definition.position, field_definition.key
      ),
      32768
    ),
    ''
  ) into new.search_text
  from public.business_data_fields field_definition
  where field_definition.collection_id = new.collection_id
    and field_definition.user_id = new.user_id
    and field_definition.searchable
    and field_definition.ai_exposure in ('answer', 'filter_only')
    and new.values ? field_definition.key
    and new.values -> field_definition.key <> 'null'::jsonb;

  return new;
end;
$$;

revoke execute on function public.business_data_validate_record()
  from public, anon, authenticated;
grant execute on function public.business_data_validate_record()
  to service_role;

drop trigger if exists business_data_records_validate
  on public.business_data_records;
create trigger business_data_records_validate
  before insert or update of values, collection_id, user_id
  on public.business_data_records
  for each row execute function public.business_data_validate_record();

-- Existing record JSON makes destructive schema edits ambiguous. Until an
-- explicit migration path is introduced, block structural changes while
-- records exist and keep the searchable projection synchronized.
create or replace function public.business_data_guard_field_schema_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from public.business_data_records
    where collection_id = old.collection_id
    limit 1
  ) then
    raise exception 'Cannot delete a Business Data field while records exist'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' and new.required and exists (
    select 1 from public.business_data_records
    where collection_id = new.collection_id
    limit 1
  ) then
    raise exception 'Cannot add a required Business Data field while records exist'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.user_id is distinct from old.user_id
      or new.collection_id is distinct from old.collection_id
    )
  then
    raise exception 'Cannot move a Business Data field between collections'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.key is distinct from old.key
      or new.data_type is distinct from old.data_type
      or new.required is distinct from old.required
      or new.validation is distinct from old.validation
    )
    and exists (
      select 1 from public.business_data_records
      where collection_id in (old.collection_id, new.collection_id)
      limit 1
    )
  then
    raise exception 'Cannot structurally change a Business Data field while records exist'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.business_data_guard_field_schema_change()
  from public, anon, authenticated;
grant execute on function public.business_data_guard_field_schema_change()
  to service_role;

drop trigger if exists business_data_fields_guard_schema_change
  on public.business_data_fields;
create trigger business_data_fields_guard_schema_change
  before insert or update or delete on public.business_data_fields
  for each row execute function public.business_data_guard_field_schema_change();

create or replace function public.business_data_after_field_schema_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  affected_collection_id uuid;
begin
  if tg_op = 'DELETE' then
    affected_collection_id := old.collection_id;
  else
    affected_collection_id := new.collection_id;
  end if;

  update public.business_data_collections
  set schema_version = schema_version + 1
  where id = affected_collection_id;

  if tg_op = 'UPDATE'
    and (
      new.searchable is distinct from old.searchable
      or new.ai_exposure is distinct from old.ai_exposure
    )
  then
    update public.business_data_records
    set values = values
    where collection_id = new.collection_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.business_data_after_field_schema_change()
  from public, anon, authenticated;
grant execute on function public.business_data_after_field_schema_change()
  to service_role;

drop trigger if exists business_data_fields_after_schema_change
  on public.business_data_fields;
create trigger business_data_fields_after_schema_change
  after insert or update or delete on public.business_data_fields
  for each row execute function public.business_data_after_field_schema_change();

-- 9) Atomic service mutation functions ----------------------------------------

create or replace function public.business_data_create_manual_collection(
  p_user_id uuid,
  p_key text,
  p_name text,
  p_description text,
  p_kind text,
  p_access_scope text,
  p_ai_enabled boolean,
  p_status text,
  p_fields jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_collection_id uuid;
begin
  if p_fields is null
    or jsonb_typeof(p_fields) <> 'array'
    or jsonb_array_length(p_fields) = 0
  then
    raise exception 'Business Data fields are required'
      using errcode = 'check_violation';
  end if;

  insert into public.business_data_collections (
    user_id,
    key,
    name,
    description,
    kind,
    access_scope,
    ai_enabled,
    status
  ) values (
    p_user_id,
    p_key,
    p_name,
    p_description,
    p_kind,
    p_access_scope,
    p_ai_enabled,
    p_status
  )
  returning id into new_collection_id;

  insert into public.business_data_fields (
    user_id,
    collection_id,
    key,
    label,
    description,
    data_type,
    semantic_role,
    required,
    searchable,
    filterable,
    ai_exposure,
    position,
    validation
  )
  select
    p_user_id,
    new_collection_id,
    field_definition.key,
    field_definition.label,
    coalesce(field_definition.description, ''),
    field_definition.data_type,
    field_definition.semantic_role,
    field_definition.required,
    field_definition.searchable,
    field_definition.filterable,
    field_definition.ai_exposure,
    field_definition.position,
    coalesce(field_definition.validation, '{}'::jsonb)
  from jsonb_to_recordset(p_fields) as field_definition(
    key text,
    label text,
    description text,
    data_type text,
    semantic_role text,
    required boolean,
    searchable boolean,
    filterable boolean,
    ai_exposure text,
    position integer,
    validation jsonb
  );

  insert into public.business_data_sources (
    user_id,
    collection_id,
    name,
    source_type,
    status
  ) values (
    p_user_id,
    new_collection_id,
    'مدیریت دستی',
    'manual',
    'ready'
  );

  return new_collection_id;
end;
$$;

revoke execute on function public.business_data_create_manual_collection(
  uuid, text, text, text, text, text, boolean, text, jsonb
) from public, anon, authenticated;
grant execute on function public.business_data_create_manual_collection(
  uuid, text, text, text, text, text, boolean, text, jsonb
) to service_role;

create or replace function public.business_data_move_field(
  p_user_id uuid,
  p_collection_id uuid,
  p_field_id uuid,
  p_direction integer
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_position integer;
  target_field_id uuid;
  target_position integer;
  temporary_position integer;
begin
  if p_direction not in (-1, 1) then
    raise exception 'Invalid Business Data field direction'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_collection_id::text, 1));

  select position into current_position
  from public.business_data_fields
  where id = p_field_id
    and collection_id = p_collection_id
    and user_id = p_user_id
  for update;

  if current_position is null then
    raise exception 'Business Data field move unavailable'
      using errcode = 'check_violation';
  end if;

  if p_direction = -1 then
    select id, position into target_field_id, target_position
    from public.business_data_fields
    where collection_id = p_collection_id
      and user_id = p_user_id
      and position < current_position
    order by position desc
    limit 1
    for update;
  else
    select id, position into target_field_id, target_position
    from public.business_data_fields
    where collection_id = p_collection_id
      and user_id = p_user_id
      and position > current_position
    order by position asc
    limit 1
    for update;
  end if;

  if target_field_id is null or target_position is null then
    raise exception 'Business Data field move unavailable'
      using errcode = 'check_violation';
  end if;

  select coalesce(max(position), 0) + 100 into temporary_position
  from public.business_data_fields
  where collection_id = p_collection_id
    and user_id = p_user_id;

  update public.business_data_fields
  set position = temporary_position
  where id = p_field_id
    and collection_id = p_collection_id
    and user_id = p_user_id;

  update public.business_data_fields
  set position = current_position
  where id = target_field_id
    and collection_id = p_collection_id
    and user_id = p_user_id;

  update public.business_data_fields
  set position = target_position
  where id = p_field_id
    and collection_id = p_collection_id
    and user_id = p_user_id;
end;
$$;

revoke execute on function public.business_data_move_field(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.business_data_move_field(uuid, uuid, uuid, integer)
  to service_role;

-- 10) Atomic ingestion functions -----------------------------------------------

create or replace function public.business_data_import_records(
  p_user_id uuid,
  p_collection_id uuid,
  p_source_id uuid,
  p_source_type text,
  p_source_name text,
  p_source_configuration jsonb,
  p_field_mapping jsonb,
  p_records jsonb,
  p_rejected_count integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  run_row public.business_data_sync_runs%rowtype;
  item jsonb;
  record_values jsonb;
  record_external_id text;
  record_checksum text;
  existing_record_id uuid;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_skipped_count integer := 0;
  v_failed_count integer := greatest(coalesce(p_rejected_count, 0), 0);
begin
  if not exists (
    select 1 from public.business_data_collections
    where id = p_collection_id and user_id = p_user_id
  ) then
    raise exception 'Business Data collection was not found' using errcode = 'foreign_key_violation';
  end if;

  if p_source_type not in ('csv', 'excel', 'google_sheets', 'supabase')
    or p_source_name is null
    or char_length(btrim(p_source_name)) = 0
    or p_source_configuration is null
    or jsonb_typeof(p_source_configuration) <> 'object'
    or p_field_mapping is null
    or jsonb_typeof(p_field_mapping) <> 'object'
    or p_records is null
    or jsonb_typeof(p_records) <> 'array'
    or jsonb_array_length(p_records) > 2000
    or p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) = 0
    or char_length(p_idempotency_key) > 120
  then
    raise exception 'Business Data import input is invalid' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.business_data_sources
    where id = p_source_id
      and (user_id <> p_user_id or collection_id <> p_collection_id)
  ) then
    raise exception 'Business Data source does not belong to this collection' using errcode = 'foreign_key_violation';
  end if;

  insert into public.business_data_sources (
    id, user_id, collection_id, name, source_type, status, configuration,
    field_mapping, last_attempted_at, last_error
  ) values (
    p_source_id, p_user_id, p_collection_id, btrim(p_source_name), p_source_type,
    'syncing', p_source_configuration, p_field_mapping, now(), null
  ) on conflict (id) do update set
    name = excluded.name,
    source_type = excluded.source_type,
    status = 'syncing',
    configuration = excluded.configuration,
    field_mapping = excluded.field_mapping,
    last_attempted_at = now(),
    last_error = null;

  insert into public.business_data_sync_runs (
    user_id, collection_id, source_id, status, idempotency_key, started_at
  ) values (
    p_user_id, p_collection_id, p_source_id, 'running', p_idempotency_key, now()
  ) on conflict (source_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning * into run_row;

  if run_row.id is null then
    select * into run_row
    from public.business_data_sync_runs
    where source_id = p_source_id and idempotency_key = p_idempotency_key;
    update public.business_data_sources
    set status = case when run_row.status = 'failed' then 'error' else 'ready' end
    where id = p_source_id
      and user_id = p_user_id
      and collection_id = p_collection_id;
    return jsonb_build_object(
      'runId', run_row.id,
      'insertedCount', run_row.inserted_count,
      'updatedCount', run_row.updated_count,
      'skippedCount', run_row.skipped_count,
      'failedCount', run_row.failed_count,
      'status', run_row.status,
      'idempotent', true
    );
  end if;

  for item in select value from jsonb_array_elements(p_records)
  loop
    record_values := item -> 'values';
    record_external_id := nullif(btrim(item ->> 'externalId'), '');
    record_checksum := nullif(btrim(item ->> 'checksum'), '');
    if record_values is null or jsonb_typeof(record_values) <> 'object' then
      raise exception 'Business Data import record is invalid' using errcode = 'check_violation';
    end if;

    if record_external_id is null then
      insert into public.business_data_records (
        user_id, collection_id, source_id, values, checksum, source_updated_at, status
      ) values (
        p_user_id, p_collection_id, p_source_id, record_values, record_checksum, now(), 'active'
      );
      v_inserted_count := v_inserted_count + 1;
    else
      select id into existing_record_id
      from public.business_data_records
      where collection_id = p_collection_id and external_id = record_external_id
      for update;

      if existing_record_id is null then
        insert into public.business_data_records (
          user_id, collection_id, source_id, external_id, values, checksum, source_updated_at, status
        ) values (
          p_user_id, p_collection_id, p_source_id, record_external_id, record_values,
          record_checksum, now(), 'active'
        );
        v_inserted_count := v_inserted_count + 1;
      elsif exists (
        select 1 from public.business_data_records
        where id = existing_record_id and checksum is not distinct from record_checksum
      ) then
        v_skipped_count := v_skipped_count + 1;
      else
        update public.business_data_records
        set source_id = p_source_id,
            values = record_values,
            checksum = record_checksum,
            source_updated_at = now(),
            status = 'active'
        where id = existing_record_id and user_id = p_user_id;
        v_updated_count := v_updated_count + 1;
      end if;
    end if;
  end loop;

  update public.business_data_sync_runs
  set status = case when v_failed_count > 0 then 'partial' else 'succeeded' end,
      inserted_count = v_inserted_count,
      updated_count = v_updated_count,
      skipped_count = v_skipped_count,
      failed_count = v_failed_count,
      completed_at = now()
  where id = run_row.id;

  update public.business_data_sources
  set status = 'ready', last_succeeded_at = now(), last_error = null
  where id = p_source_id and user_id = p_user_id and collection_id = p_collection_id;

  return jsonb_build_object(
    'runId', run_row.id,
    'insertedCount', v_inserted_count,
    'updatedCount', v_updated_count,
    'skippedCount', v_skipped_count,
    'failedCount', v_failed_count,
    'status', case when v_failed_count > 0 then 'partial' else 'succeeded' end,
    'idempotent', false
  );
exception when others then
  if run_row.id is not null then
    update public.business_data_sync_runs
    set status = 'failed', error_summary = 'Import could not be completed safely.', completed_at = now()
    where id = run_row.id;
    update public.business_data_sources
    set status = 'error', last_error = 'همگام‌سازی کامل نشد؛ دوباره تلاش کنید.'
    where id = p_source_id and user_id = p_user_id and collection_id = p_collection_id;
  end if;
  raise;
end;
$$;

revoke execute on function public.business_data_import_records(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, integer, text
) from public, anon, authenticated;
grant execute on function public.business_data_import_records(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, integer, text
) to service_role;

create or replace function public.business_data_import_records_with_fields(
  p_user_id uuid,
  p_collection_id uuid,
  p_source_id uuid,
  p_source_type text,
  p_source_name text,
  p_source_configuration jsonb,
  p_field_mapping jsonb,
  p_new_fields jsonb,
  p_records jsonb,
  p_rejected_count integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_field jsonb;
  new_field_key text;
  next_position integer;
begin
  if not exists (
    select 1 from public.business_data_collections
    where id = p_collection_id and user_id = p_user_id
  ) then
    raise exception 'Business Data collection was not found' using errcode = 'foreign_key_violation';
  end if;

  -- Serialize field additions for this collection. Positions supplied by the
  -- browser are advisory only; the transaction assigns the next positions.
  perform pg_advisory_xact_lock(
    hashtextextended('business-data-fields:' || p_collection_id::text, 0)
  );

  -- Let the existing import transaction resolve retries before attempting to
  -- recreate fields from the same idempotent request.
  if exists (
    select 1
    from public.business_data_sync_runs
    where source_id = p_source_id
      and idempotency_key = p_idempotency_key
  ) then
    return public.business_data_import_records(
      p_user_id,
      p_collection_id,
      p_source_id,
      p_source_type,
      p_source_name,
      p_source_configuration,
      p_field_mapping,
      p_records,
      p_rejected_count,
      p_idempotency_key
    );
  end if;

  if p_new_fields is null
    or jsonb_typeof(p_new_fields) <> 'array'
    or jsonb_array_length(p_new_fields) > 100
  then
    raise exception 'Business Data proposed fields are invalid' using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_new_fields) as fields(item)
    where jsonb_typeof(fields.item) <> 'object'
      or jsonb_typeof(fields.item -> 'key') <> 'string'
      or (fields.item ->> 'key') !~ '^[a-z][a-z0-9_]{0,63}$'
      or jsonb_typeof(fields.item -> 'label') <> 'string'
      or char_length(btrim(fields.item ->> 'label')) not between 1 and 120
      or jsonb_typeof(fields.item -> 'data_type') <> 'string'
      or jsonb_typeof(fields.item -> 'semantic_role') <> 'string'
  ) then
    raise exception 'Business Data proposed fields are invalid' using errcode = 'check_violation';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_new_fields)
  ) <> (
    select count(distinct item ->> 'key') from jsonb_array_elements(p_new_fields) as fields(item)
  ) then
    raise exception 'Business Data proposed fields contain duplicates' using errcode = 'unique_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_new_fields) as fields(item)
    join public.business_data_fields existing_field
      on existing_field.collection_id = p_collection_id
     and existing_field.user_id = p_user_id
     and existing_field.key = fields.item ->> 'key'
  ) then
    raise exception 'Business Data field already exists' using errcode = 'unique_violation';
  end if;

  select coalesce(max(position), -1) + 1
    into next_position
  from public.business_data_fields
  where collection_id = p_collection_id
    and user_id = p_user_id;

  for new_field in select value from jsonb_array_elements(p_new_fields)
  loop
    new_field_key := new_field ->> 'key';
    insert into public.business_data_fields (
      user_id, collection_id, key, label, description, data_type, semantic_role,
      required, searchable, filterable, ai_exposure, position, validation
    ) values (
      p_user_id,
      p_collection_id,
      new_field_key,
      new_field ->> 'label',
      coalesce(new_field ->> 'description', ''),
      new_field ->> 'data_type',
      new_field ->> 'semantic_role',
      coalesce((new_field ->> 'required')::boolean, false),
      coalesce((new_field ->> 'searchable')::boolean, false),
      coalesce((new_field ->> 'filterable')::boolean, false),
      coalesce(new_field ->> 'ai_exposure', 'hidden'),
      next_position,
      coalesce(new_field -> 'validation', '{}'::jsonb)
    );
    next_position := next_position + 1;
  end loop;

  return public.business_data_import_records(
    p_user_id,
    p_collection_id,
    p_source_id,
    p_source_type,
    p_source_name,
    p_source_configuration,
    p_field_mapping,
    p_records,
    p_rejected_count,
    p_idempotency_key
  );
end;
$$;

revoke execute on function public.business_data_import_records_with_fields(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, integer, text
) from public, anon, authenticated;
grant execute on function public.business_data_import_records_with_fields(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, integer, text
) to service_role;

create or replace function public.business_data_create_import_collection(
  p_user_id uuid,
  p_key text,
  p_name text,
  p_description text,
  p_kind text,
  p_access_scope text,
  p_ai_enabled boolean,
  p_status text,
  p_fields jsonb,
  p_source_id uuid,
  p_source_type text,
  p_source_name text,
  p_source_configuration jsonb,
  p_field_mapping jsonb,
  p_records jsonb,
  p_rejected_count integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  collection_id uuid;
  import_result jsonb;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) = 0 then
    raise exception 'Business Data import fields are invalid' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_key, 0));

  select id into collection_id
  from public.business_data_collections
  where user_id = p_user_id and key = p_key;

  if collection_id is not null then
    import_result := public.business_data_import_records(
      p_user_id,
      collection_id,
      p_source_id,
      p_source_type,
      p_source_name,
      p_source_configuration,
      p_field_mapping,
      p_records,
      p_rejected_count,
      p_idempotency_key
    );
    return import_result || jsonb_build_object('collectionId', collection_id);
  end if;

  insert into public.business_data_collections (
    user_id, key, name, description, kind, access_scope, ai_enabled, status
  ) values (
    p_user_id, p_key, btrim(p_name), coalesce(p_description, ''), p_kind,
    p_access_scope, p_ai_enabled, p_status
  ) returning id into collection_id;

  insert into public.business_data_fields (
    user_id, collection_id, key, label, description, data_type, semantic_role,
    required, searchable, filterable, ai_exposure, position, validation
  )
  select
    p_user_id,
    collection_id,
    item ->> 'key',
    item ->> 'label',
    coalesce(item ->> 'description', ''),
    item ->> 'data_type',
    item ->> 'semantic_role',
    coalesce((item ->> 'required')::boolean, false),
    coalesce((item ->> 'searchable')::boolean, false),
    coalesce((item ->> 'filterable')::boolean, false),
    item ->> 'ai_exposure',
    position - 1,
    coalesce(item -> 'validation', '{}'::jsonb)
  from jsonb_array_elements(p_fields) with ordinality as fields(item, position);

  import_result := public.business_data_import_records(
    p_user_id,
    collection_id,
    p_source_id,
    p_source_type,
    p_source_name,
    p_source_configuration,
    p_field_mapping,
    p_records,
    p_rejected_count,
    p_idempotency_key
  );

  return import_result || jsonb_build_object('collectionId', collection_id);
end;
$$;

revoke execute on function public.business_data_create_import_collection(
  uuid, text, text, text, text, text, boolean, text, jsonb, uuid, text,
  text, jsonb, jsonb, jsonb, integer, text
) from public, anon, authenticated;
grant execute on function public.business_data_create_import_collection(
  uuid, text, text, text, text, text, boolean, text, jsonb, uuid, text,
  text, jsonb, jsonb, jsonb, integer, text
) to service_role;

create or replace function public.business_data_delete_collection(
  p_user_id uuid,
  p_collection_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.business_data_collections
    where id = p_collection_id and user_id = p_user_id
  ) then
    raise exception 'Business Data collection was not found' using errcode = 'foreign_key_violation';
  end if;

  -- Delete collection-owned state in dependency order. The explicit order keeps
  -- restrictive field/source relationships safe while preserving tenant scope.
  delete from public.business_data_private_verification_challenges
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_verified_customer_sessions
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_private_verification_attempts
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_private_access_configs
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_sync_runs
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_records
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_source_secrets
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_sources
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_fields
  where collection_id = p_collection_id and user_id = p_user_id;
  delete from public.business_data_collections
  where id = p_collection_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.business_data_delete_collection(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.business_data_delete_collection(uuid, uuid)
  to service_role;

-- 11) Bounded public-catalog lookup for the assistant --------------------------

create or replace function public.business_data_lookup_public(
  p_user_id uuid,
  p_collection_key text,
  p_query text,
  p_filters jsonb,
  p_sort jsonb,
  p_projection_keys jsonb,
  p_limit integer
)
returns table (
  record_values jsonb,
  data_updated_at timestamptz,
  matched_count bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_collection_id uuid;
  v_filter jsonb;
  v_filter_field public.business_data_fields%rowtype;
  v_filter_operator text;
  v_query text;
  v_sort_field public.business_data_fields%rowtype;
  v_sort_key text;
  v_sort_type text;
  v_sort_direction text;
  v_projection_key text;
begin
  if p_collection_key is null or char_length(p_collection_key) > 64 then
    raise exception 'Invalid Business Data collection key'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 5 then
    raise exception 'Invalid Business Data result limit'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_filters is null then
    p_filters := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_filters) <> 'array' or jsonb_array_length(p_filters) > 5 then
    raise exception 'Invalid Business Data filters'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_projection_keys is null
    or jsonb_typeof(p_projection_keys) <> 'array'
    or jsonb_array_length(p_projection_keys) < 1
    or jsonb_array_length(p_projection_keys) > 6 then
    raise exception 'Invalid Business Data projection'
      using errcode = 'invalid_parameter_value';
  end if;

  select collection.id into v_collection_id
  from public.business_data_collections collection
  where collection.user_id = p_user_id
    and collection.key = p_collection_key
    and collection.access_scope = 'public_catalog'
    and collection.ai_enabled
    and collection.status = 'active';

  -- Missing, private, disabled, and cross-tenant collections are deliberately
  -- indistinguishable and return no rows.
  if v_collection_id is null then
    return;
  end if;

  v_query := nullif(btrim(coalesce(p_query, '')), '');
  if v_query is not null and char_length(v_query) > 160 then
    raise exception 'Invalid Business Data search query'
      using errcode = 'invalid_parameter_value';
  end if;
  if v_query is not null and not exists (
    select 1
    from public.business_data_fields field_definition
    where field_definition.user_id = p_user_id
      and field_definition.collection_id = v_collection_id
      and field_definition.searchable
      and field_definition.ai_exposure in ('answer', 'filter_only')
  ) then
    raise exception 'Collection is not searchable'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_filter in select value from jsonb_array_elements(p_filters)
  loop
    if jsonb_typeof(v_filter) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_filter) as filter_key(key)
        where filter_key.key not in ('field', 'op', 'value')
      ) then
      raise exception 'Invalid Business Data filter shape'
        using errcode = 'invalid_parameter_value';
    end if;

    select * into v_filter_field
    from public.business_data_fields field_definition
    where field_definition.user_id = p_user_id
      and field_definition.collection_id = v_collection_id
      and field_definition.key = v_filter ->> 'field'
      and field_definition.filterable
      and field_definition.ai_exposure in ('answer', 'filter_only');
    if not found then
      raise exception 'Invalid Business Data filter field'
        using errcode = 'invalid_parameter_value';
    end if;

    v_filter_operator := v_filter ->> 'op';
    if v_filter_operator is null or not (
      (v_filter_field.data_type in ('number', 'currency', 'date', 'datetime')
        and v_filter_operator in ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'))
      or (v_filter_field.data_type in ('text', 'long_text', 'url')
        and v_filter_operator in ('eq', 'neq', 'contains'))
      or (v_filter_field.data_type = 'select'
        and v_filter_operator in ('eq', 'neq'))
      or (v_filter_field.data_type = 'boolean' and v_filter_operator = 'eq')
    ) then
      raise exception 'Invalid Business Data filter operator'
        using errcode = 'invalid_parameter_value';
    end if;

    if v_filter_operator = 'between' then
      if jsonb_typeof(v_filter -> 'value') <> 'array'
        or jsonb_array_length(v_filter -> 'value') <> 2
        or (
          v_filter_field.data_type in ('number', 'currency')
          and exists (
            select 1
            from jsonb_array_elements(v_filter -> 'value') as range_item(value)
            where jsonb_typeof(range_item.value) <> 'number'
          )
        )
        or (
          v_filter_field.data_type in ('date', 'datetime')
          and exists (
            select 1
            from jsonb_array_elements(v_filter -> 'value') as range_item(value)
            where jsonb_typeof(range_item.value) <> 'string'
              or char_length(range_item.value #>> '{}') > 200
          )
        )
        or (
          v_filter_field.data_type in ('number', 'currency')
          and ((v_filter -> 'value' -> 0) #>> '{}')::numeric
            > ((v_filter -> 'value' -> 1) #>> '{}')::numeric
        )
        or (
          v_filter_field.data_type = 'date'
          and exists (
            select 1
            from jsonb_array_elements(v_filter -> 'value') as range_item(value)
            where range_item.value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$'
          )
        )
        or (
          v_filter_field.data_type = 'datetime'
          and exists (
            select 1
            from jsonb_array_elements(v_filter -> 'value') as range_item(value)
            where range_item.value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$'
          )
        ) then
        raise exception 'Invalid Business Data range value'
          using errcode = 'invalid_parameter_value';
      end if;
    elsif (
      v_filter_field.data_type in ('number', 'currency')
      and jsonb_typeof(v_filter -> 'value') <> 'number'
    ) or (
      v_filter_field.data_type = 'boolean'
      and jsonb_typeof(v_filter -> 'value') <> 'boolean'
    ) or (
      v_filter_field.data_type not in ('number', 'currency', 'boolean')
      and (
        jsonb_typeof(v_filter -> 'value') <> 'string'
        or char_length(v_filter ->> 'value') > 200
      )
    ) or (
      v_filter_field.data_type = 'date'
      and v_filter ->> 'value' !~ '^\d{4}-\d{2}-\d{2}$'
    ) or (
      v_filter_field.data_type = 'datetime'
      and v_filter ->> 'value' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$'
    ) then
      raise exception 'Invalid Business Data filter value'
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  v_sort_key := null;
  v_sort_type := null;
  v_sort_direction := null;
  if p_sort is not null and p_sort <> 'null'::jsonb then
    if jsonb_typeof(p_sort) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(p_sort) as sort_key(key)
        where sort_key.key not in ('field', 'direction')
      )
      or p_sort ->> 'direction' is null
      or p_sort ->> 'direction' not in ('asc', 'desc') then
      raise exception 'Invalid Business Data sort'
        using errcode = 'invalid_parameter_value';
    end if;
    select * into v_sort_field
    from public.business_data_fields field_definition
    where field_definition.user_id = p_user_id
      and field_definition.collection_id = v_collection_id
      and field_definition.key = p_sort ->> 'field'
      and field_definition.filterable
      and field_definition.ai_exposure in ('answer', 'filter_only');
    if not found then
      raise exception 'Invalid Business Data sort field'
        using errcode = 'invalid_parameter_value';
    end if;
    v_sort_key := v_sort_field.key;
    v_sort_type := v_sort_field.data_type;
    v_sort_direction := p_sort ->> 'direction';
  end if;

  for v_projection_key in
    select projection_item.value #>> '{}'
    from jsonb_array_elements(p_projection_keys) as projection_item(value)
  loop
    if not exists (
      select 1
      from public.business_data_fields field_definition
      where field_definition.user_id = p_user_id
        and field_definition.collection_id = v_collection_id
        and field_definition.key = v_projection_key
        and field_definition.ai_exposure = 'answer'
    ) then
      raise exception 'Invalid Business Data answer projection'
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  return query
  select
    projected.record_values,
    coalesce(record.source_updated_at, record.updated_at) as data_updated_at,
    count(*) over () as matched_count
  from public.business_data_records record
  cross join lateral (
    select coalesce(
      jsonb_object_agg(
        field_definition.key,
        record.values -> field_definition.key
        order by field_definition.position
      ) filter (where record.values ? field_definition.key),
      '{}'::jsonb
    ) as record_values
    from public.business_data_fields field_definition
    where field_definition.user_id = p_user_id
      and field_definition.collection_id = v_collection_id
      and field_definition.ai_exposure = 'answer'
      and field_definition.key in (
        select projection_item.value #>> '{}'
        from jsonb_array_elements(p_projection_keys) as projection_item(value)
      )
  ) projected
  where record.user_id = p_user_id
    and record.collection_id = v_collection_id
    and record.status = 'active'
    and (
      v_query is null
      or not exists (
        select 1
        from regexp_split_to_table(lower(v_query), '\s+') as search_token(token)
        where search_token.token <> ''
          and position(search_token.token in lower(record.search_text)) = 0
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_filters) as filter_entry(filter_item)
      join public.business_data_fields field_definition
        on field_definition.user_id = p_user_id
       and field_definition.collection_id = v_collection_id
       and field_definition.key = filter_item ->> 'field'
      where not (
        record.values ? field_definition.key
        and record.values -> field_definition.key <> 'null'::jsonb
        and case filter_item ->> 'op'
          when 'eq' then
            case
              when field_definition.data_type in ('number', 'currency')
                then (record.values ->> field_definition.key)::numeric = (filter_item -> 'value' #>> '{}')::numeric
              when field_definition.data_type = 'boolean'
                then (record.values ->> field_definition.key)::boolean = (filter_item -> 'value' #>> '{}')::boolean
              else lower(record.values ->> field_definition.key) = lower(filter_item ->> 'value')
            end
          when 'neq' then
            case
              when field_definition.data_type in ('number', 'currency')
                then (record.values ->> field_definition.key)::numeric <> (filter_item -> 'value' #>> '{}')::numeric
              else lower(record.values ->> field_definition.key) <> lower(filter_item ->> 'value')
            end
          when 'contains' then
            position(lower(filter_item ->> 'value') in lower(record.values ->> field_definition.key)) > 0
          when 'gt' then
            case
              when field_definition.data_type in ('number', 'currency')
                then (record.values ->> field_definition.key)::numeric > (filter_item -> 'value' #>> '{}')::numeric
              else record.values ->> field_definition.key > filter_item ->> 'value'
            end
          when 'gte' then
            case
              when field_definition.data_type in ('number', 'currency')
                then (record.values ->> field_definition.key)::numeric >= (filter_item -> 'value' #>> '{}')::numeric
              else record.values ->> field_definition.key >= filter_item ->> 'value'
            end
          when 'lt' then
            case
              when field_definition.data_type in ('number', 'currency')
                then (record.values ->> field_definition.key)::numeric < (filter_item -> 'value' #>> '{}')::numeric
              else record.values ->> field_definition.key < filter_item ->> 'value'
            end
          when 'lte' then
            case
              when field_definition.data_type in ('number', 'currency')
                then (record.values ->> field_definition.key)::numeric <= (filter_item -> 'value' #>> '{}')::numeric
              else record.values ->> field_definition.key <= filter_item ->> 'value'
            end
          when 'between' then
            case
              when field_definition.data_type in ('number', 'currency') then
                (record.values ->> field_definition.key)::numeric between
                  ((filter_item -> 'value' -> 0) #>> '{}')::numeric and
                  ((filter_item -> 'value' -> 1) #>> '{}')::numeric
              else
                record.values ->> field_definition.key between
                  filter_item -> 'value' ->> 0 and filter_item -> 'value' ->> 1
            end
          else false
        end
      )
    )
  order by
    case when v_sort_direction = 'asc' and v_sort_type in ('number', 'currency')
      then (record.values ->> v_sort_key)::numeric end asc nulls last,
    case when v_sort_direction = 'desc' and v_sort_type in ('number', 'currency')
      then (record.values ->> v_sort_key)::numeric end desc nulls last,
    case when v_sort_direction = 'asc' and v_sort_type not in ('number', 'currency')
      then lower(record.values ->> v_sort_key) end asc nulls last,
    case when v_sort_direction = 'desc' and v_sort_type not in ('number', 'currency')
      then lower(record.values ->> v_sort_key) end desc nulls last,
    record.updated_at desc
  limit p_limit;
end;
$$;

revoke execute on function public.business_data_lookup_public(
  uuid, text, text, jsonb, jsonb, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.business_data_lookup_public(
  uuid, text, text, jsonb, jsonb, jsonb, integer
) to service_role;

-- 12) Row Level Security and explicit grants ----------------------------------

alter table public.business_data_collections enable row level security;
alter table public.business_data_fields enable row level security;
alter table public.business_data_sources enable row level security;
alter table public.business_data_records enable row level security;
alter table public.business_data_source_secrets enable row level security;
alter table public.business_data_sync_runs enable row level security;

drop policy if exists "business data collections: select own"
  on public.business_data_collections;
create policy "business data collections: select own"
  on public.business_data_collections for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data collections: insert own"
  on public.business_data_collections;
create policy "business data collections: insert own"
  on public.business_data_collections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data collections: update own"
  on public.business_data_collections;
create policy "business data collections: update own"
  on public.business_data_collections for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data collections: delete own"
  on public.business_data_collections;
create policy "business data collections: delete own"
  on public.business_data_collections for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data fields: select own"
  on public.business_data_fields;
create policy "business data fields: select own"
  on public.business_data_fields for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data fields: insert own"
  on public.business_data_fields;
create policy "business data fields: insert own"
  on public.business_data_fields for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data fields: update own"
  on public.business_data_fields;
create policy "business data fields: update own"
  on public.business_data_fields for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data fields: delete own"
  on public.business_data_fields;
create policy "business data fields: delete own"
  on public.business_data_fields for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data sources: select own"
  on public.business_data_sources;
create policy "business data sources: select own"
  on public.business_data_sources for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data sources: insert own"
  on public.business_data_sources;
create policy "business data sources: insert own"
  on public.business_data_sources for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data sources: update own"
  on public.business_data_sources;
create policy "business data sources: update own"
  on public.business_data_sources for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data sources: delete own"
  on public.business_data_sources;
create policy "business data sources: delete own"
  on public.business_data_sources for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data records: select own"
  on public.business_data_records;
create policy "business data records: select own"
  on public.business_data_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data records: insert own"
  on public.business_data_records;
create policy "business data records: insert own"
  on public.business_data_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data records: update own"
  on public.business_data_records;
create policy "business data records: update own"
  on public.business_data_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "business data records: delete own"
  on public.business_data_records;
create policy "business data records: delete own"
  on public.business_data_records for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "business data sync runs: select own"
  on public.business_data_sync_runs;
create policy "business data sync runs: select own"
  on public.business_data_sync_runs for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Revoke automatic public-schema grants first. Milestone 1 exposes owner-scoped
-- reads only: direct writes through the generated Data API could bypass the
-- richer TypeScript validator. Owner mutations use the authenticated,
-- server-only Business Data service boundary. Secrets and sync-run writes
-- remain server-only.
revoke all on table public.business_data_collections from anon, authenticated;
revoke all on table public.business_data_fields from anon, authenticated;
revoke all on table public.business_data_sources from anon, authenticated;
revoke all on table public.business_data_records from anon, authenticated;
revoke all on table public.business_data_source_secrets from anon, authenticated;
revoke all on table public.business_data_sync_runs from anon, authenticated;

grant select on table public.business_data_collections to authenticated;
grant select on table public.business_data_fields to authenticated;
grant select on table public.business_data_sources to authenticated;
grant select on table public.business_data_records to authenticated;
grant select on table public.business_data_sync_runs to authenticated;

-- 13) Verified-customer private access ---------------------------------------
--
-- Private customer retrieval is deliberately record-scoped. A verified channel
-- identity may see only the one record it proved ownership of, for a short
-- period, and never receives filter-only or hidden values.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.business_data_collections'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%ai_enabled%access_scope%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.business_data_collections drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.business_data_collections
  drop constraint if exists business_data_collections_ai_scope_check;
alter table public.business_data_collections
  add constraint business_data_collections_ai_scope_check
  check (not ai_enabled or access_scope in ('public_catalog', 'verified_customer'));

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.business_data_fields'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%semantic_role%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.business_data_fields drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.business_data_fields
  drop constraint if exists business_data_fields_semantic_role_check;
alter table public.business_data_fields
  add constraint business_data_fields_semantic_role_check
  check (semantic_role in (
    'title', 'description', 'category', 'sku', 'price', 'currency',
    'availability', 'status', 'reference', 'url', 'quantity', 'start_at',
    'end_at', 'location', 'customer_identifier', 'phone', 'email',
    'account_identifier', 'channel_identifier', 'tracking', 'internal_notes',
    'custom'
  ));

comment on column public.business_data_collections.access_scope is
  'public_catalog is customer-safe; verified_customer requires an enabled two-field verification configuration; internal is never AI-readable.';
comment on column public.business_data_collections.ai_enabled is
  'Customer-facing AI is permitted for public_catalog and, only with valid private-access configuration, verified_customer. Internal remains excluded.';

create table if not exists public.business_data_private_access_configs (
  collection_id          uuid primary key,
  user_id                uuid not null references auth.users (id) on delete cascade,
  locator_field_id       uuid not null,
  verification_field_id uuid not null,
  enabled                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id)
    on delete cascade,
  foreign key (locator_field_id, collection_id, user_id)
    references public.business_data_fields (id, collection_id, user_id)
    on delete restrict,
  foreign key (verification_field_id, collection_id, user_id)
    references public.business_data_fields (id, collection_id, user_id)
    on delete restrict,
  check (locator_field_id <> verification_field_id)
);

comment on table public.business_data_private_access_configs is
  'Owner-selected two-field verification policy for a verified_customer collection. Both fields must remain required, filterable, and filter_only.';

create table if not exists public.business_data_private_verification_challenges (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  collection_id          uuid not null,
  channel                text not null check (channel in ('telegram', 'instagram')),
  connection_id          uuid not null,
  customer_identity_hash text not null check (customer_identity_hash ~ '^[0-9a-f]{64}$'),
  candidate_record_id    uuid,
  pending_question       text not null default '' check (char_length(pending_question) <= 600),
  step                   text not null check (step in ('locator', 'verification')),
  expires_at             timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id)
    on delete cascade,
  foreign key (candidate_record_id, collection_id, user_id)
    references public.business_data_records (id, collection_id, user_id)
    on delete cascade,
  unique (user_id, collection_id, channel, connection_id, customer_identity_hash)
);

comment on table public.business_data_private_verification_challenges is
  'Short-lived in-progress verification state. It stores a candidate record reference, never a phone, email, OTP, or other proof value.';

create table if not exists public.business_data_verified_customer_sessions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  collection_id          uuid not null,
  record_id              uuid not null,
  channel                text not null check (channel in ('telegram', 'instagram')),
  connection_id          uuid not null,
  customer_identity_hash text not null check (customer_identity_hash ~ '^[0-9a-f]{64}$'),
  verified_at            timestamptz not null default now(),
  expires_at             timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id)
    on delete cascade,
  foreign key (record_id, collection_id, user_id)
    references public.business_data_records (id, collection_id, user_id)
    on delete cascade,
  unique (user_id, collection_id, channel, connection_id, customer_identity_hash)
);

comment on table public.business_data_verified_customer_sessions is
  'Short-lived record-scoped authorization after private verification. No verification input is retained.';

create table if not exists public.business_data_private_verification_attempts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  collection_id          uuid not null,
  channel                text not null check (channel in ('telegram', 'instagram')),
  connection_id          uuid not null,
  customer_identity_hash text not null check (customer_identity_hash ~ '^[0-9a-f]{64}$'),
  outcome                text not null check (outcome in ('success', 'failure', 'limited')),
  reason                 text,
  created_at             timestamptz not null default now(),
  foreign key (collection_id, user_id)
    references public.business_data_collections (id, user_id)
    on delete cascade
);

alter table public.business_data_private_verification_attempts
  add column if not exists reason text;

alter table public.business_data_private_verification_attempts
  drop constraint if exists business_data_private_verification_attempts_outcome_check;
alter table public.business_data_private_verification_attempts
  add constraint business_data_private_verification_attempts_outcome_check
  check (outcome in ('success', 'failure', 'limited', 'diagnostic'));

alter table public.business_data_private_verification_attempts
  drop constraint if exists business_data_private_verification_attempts_reason_check;
alter table public.business_data_private_verification_attempts
  add constraint business_data_private_verification_attempts_reason_check
  check (reason is null or reason in (
    'no_candidate', 'verifier_mismatch', 'config_invalid', 'challenge_expired',
    'rate_limited', 'lookup_error', 'missing_stored_value'
  ));

comment on table public.business_data_private_verification_attempts is
  'Bounded private-access audit metadata. It intentionally contains no verification values or private record values.';

create index if not exists business_data_private_challenges_expiry_idx
  on public.business_data_private_verification_challenges (expires_at);
create index if not exists business_data_verified_customer_sessions_scope_idx
  on public.business_data_verified_customer_sessions (
    user_id, collection_id, channel, connection_id, customer_identity_hash, expires_at
  );
create index if not exists business_data_private_attempts_limit_idx
  on public.business_data_private_verification_attempts (
    user_id, collection_id, channel, connection_id, customer_identity_hash, created_at desc
  );

drop trigger if exists business_data_private_access_configs_set_updated_at
  on public.business_data_private_access_configs;
create trigger business_data_private_access_configs_set_updated_at
  before update on public.business_data_private_access_configs
  for each row execute function public.set_updated_at();

drop trigger if exists business_data_private_verification_challenges_set_updated_at
  on public.business_data_private_verification_challenges;
create trigger business_data_private_verification_challenges_set_updated_at
  before update on public.business_data_private_verification_challenges
  for each row execute function public.set_updated_at();

drop trigger if exists business_data_verified_customer_sessions_set_updated_at
  on public.business_data_verified_customer_sessions;
create trigger business_data_verified_customer_sessions_set_updated_at
  before update on public.business_data_verified_customer_sessions
  for each row execute function public.set_updated_at();

create or replace function public.business_data_normalize_verification_value(
  p_value text,
  p_role text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  normalized text;
begin
  normalized := lower(btrim(translate(
    coalesce(p_value, ''),
    '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩',
    '01234567890123456789'
  )));
  if p_role = 'phone' then
    normalized := regexp_replace(normalized, '[^0-9]', '', 'g');
    if normalized ~ '^0098[0-9]{10}$' then
      normalized := '0' || substring(normalized from 5);
    elsif normalized ~ '^98[0-9]{10}$' then
      normalized := '0' || substring(normalized from 3);
    elsif normalized ~ '^9[0-9]{9}$' then
      normalized := '0' || normalized;
    end if;
  elsif p_role in ('reference', 'tracking', 'account_identifier', 'customer_identifier', 'channel_identifier') then
    normalized := regexp_replace(normalized, '[[:space:]]+', ' ', 'g');
  end if;
  return normalized;
end;
$$;

revoke execute on function public.business_data_normalize_verification_value(text, text)
  from public, anon, authenticated;
grant execute on function public.business_data_normalize_verification_value(text, text)
  to service_role;

create or replace function public.business_data_private_config_is_valid(
  p_collection_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_data_private_access_configs config
    join public.business_data_collections collection
      on collection.id = config.collection_id
     and collection.user_id = config.user_id
    join public.business_data_fields locator
      on locator.id = config.locator_field_id
     and locator.collection_id = config.collection_id
     and locator.user_id = config.user_id
    join public.business_data_fields verifier
      on verifier.id = config.verification_field_id
     and verifier.collection_id = config.collection_id
     and verifier.user_id = config.user_id
    where config.collection_id = p_collection_id
      and config.user_id = p_user_id
      and config.enabled
      and collection.access_scope = 'verified_customer'
      and collection.ai_enabled
      and collection.status = 'active'
      and locator.required and locator.filterable and locator.ai_exposure = 'filter_only'
      and verifier.required and verifier.filterable and verifier.ai_exposure = 'filter_only'
      and locator.semantic_role in ('reference', 'tracking', 'account_identifier', 'customer_identifier', 'channel_identifier')
      and verifier.semantic_role in ('phone', 'email', 'customer_identifier', 'account_identifier', 'channel_identifier')
  );
$$;

revoke execute on function public.business_data_private_config_is_valid(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.business_data_private_config_is_valid(uuid, uuid)
  to service_role;

create or replace function public.business_data_guard_private_access_config()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.enabled and not exists (
    select 1
    from public.business_data_collections collection
    join public.business_data_fields locator
      on locator.id = new.locator_field_id
     and locator.collection_id = new.collection_id
     and locator.user_id = new.user_id
    join public.business_data_fields verifier
      on verifier.id = new.verification_field_id
     and verifier.collection_id = new.collection_id
     and verifier.user_id = new.user_id
    where collection.id = new.collection_id
      and collection.user_id = new.user_id
      and collection.access_scope = 'verified_customer'
      and locator.required and locator.filterable and locator.ai_exposure = 'filter_only'
      and verifier.required and verifier.filterable and verifier.ai_exposure = 'filter_only'
      and locator.semantic_role in ('reference', 'tracking', 'account_identifier', 'customer_identifier', 'channel_identifier')
      and verifier.semantic_role in ('phone', 'email', 'customer_identifier', 'account_identifier', 'channel_identifier')
      and new.locator_field_id <> new.verification_field_id
  ) then
    raise exception 'Private access configuration requires two valid filter-only fields'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.business_data_guard_private_access_config()
  from public, anon, authenticated;
grant execute on function public.business_data_guard_private_access_config()
  to service_role;

drop trigger if exists business_data_private_access_config_guard
  on public.business_data_private_access_configs;
create trigger business_data_private_access_config_guard
  before insert or update on public.business_data_private_access_configs
  for each row execute function public.business_data_guard_private_access_config();

create or replace function public.business_data_disable_invalid_private_access()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.business_data_private_access_configs config
  set enabled = false
  where config.collection_id = new.collection_id
    and config.user_id = new.user_id
    and config.enabled
    and (config.locator_field_id = new.id or config.verification_field_id = new.id)
    and not (
      new.required and new.filterable and new.ai_exposure = 'filter_only'
    );

  update public.business_data_collections collection
  set ai_enabled = false
  where collection.id = new.collection_id
    and collection.user_id = new.user_id
    and collection.access_scope = 'verified_customer'
    and exists (
      select 1
      from public.business_data_private_access_configs config
      where config.collection_id = collection.id
        and config.user_id = collection.user_id
        and not config.enabled
    );
  return new;
end;
$$;

revoke execute on function public.business_data_disable_invalid_private_access()
  from public, anon, authenticated;
grant execute on function public.business_data_disable_invalid_private_access()
  to service_role;

drop trigger if exists business_data_fields_disable_invalid_private_access
  on public.business_data_fields;
create trigger business_data_fields_disable_invalid_private_access
  after update of required, filterable, ai_exposure on public.business_data_fields
  for each row execute function public.business_data_disable_invalid_private_access();

create or replace function public.business_data_private_find_candidate(
  p_user_id uuid,
  p_collection_key text,
  p_locator_value text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  collection_row public.business_data_collections%rowtype;
  locator_field public.business_data_fields%rowtype;
  candidate_id uuid;
  candidate_count integer := 0;
begin
  if p_collection_key is null or char_length(p_collection_key) > 64
    or p_locator_value is null or char_length(p_locator_value) > 200 then
    return null;
  end if;

  select collection.* into collection_row
  from public.business_data_collections collection
  where collection.user_id = p_user_id
    and collection.key = p_collection_key
    and collection.access_scope = 'verified_customer'
    and collection.ai_enabled
    and collection.status = 'active';
  if not found or not public.business_data_private_config_is_valid(collection_row.id, p_user_id) then
    return null;
  end if;

  select field_definition.* into locator_field
  from public.business_data_private_access_configs config
  join public.business_data_fields field_definition
    on field_definition.id = config.locator_field_id
  where config.collection_id = collection_row.id
    and config.user_id = p_user_id
    and config.enabled;
  if not found then return null; end if;

  select count(*) into candidate_count
  from public.business_data_records record
  where record.user_id = p_user_id
    and record.collection_id = collection_row.id
    and record.status = 'active'
    and public.business_data_normalize_verification_value(
      record.values ->> locator_field.key,
      locator_field.semantic_role
    ) = public.business_data_normalize_verification_value(p_locator_value, locator_field.semantic_role)
  ;

  if candidate_count <> 1 then return null; end if;

  select record.id into candidate_id
  from public.business_data_records record
  where record.user_id = p_user_id
    and record.collection_id = collection_row.id
    and record.status = 'active'
    and public.business_data_normalize_verification_value(
      record.values ->> locator_field.key,
      locator_field.semantic_role
    ) = public.business_data_normalize_verification_value(p_locator_value, locator_field.semantic_role);

  return candidate_id;
end;
$$;

revoke execute on function public.business_data_private_find_candidate(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.business_data_private_find_candidate(uuid, text, text)
  to service_role;

create or replace function public.business_data_private_verify(
  p_user_id uuid,
  p_collection_key text,
  p_candidate_record_id uuid,
  p_verification_value text,
  p_channel text,
  p_connection_id uuid,
  p_customer_identity_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  collection_row public.business_data_collections%rowtype;
  verifier_field public.business_data_fields%rowtype;
  verified boolean := false;
  failures integer := 0;
begin
  if p_collection_key is null or char_length(p_collection_key) > 64
    or p_verification_value is null or char_length(p_verification_value) > 200
    or p_channel not in ('telegram', 'instagram')
    or p_customer_identity_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select count(*) into failures
  from public.business_data_private_verification_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.collection_id in (
      select id from public.business_data_collections
      where user_id = p_user_id and key = p_collection_key
    )
    and attempt.channel = p_channel
    and attempt.connection_id = p_connection_id
    and attempt.customer_identity_hash = p_customer_identity_hash
    and attempt.outcome in ('failure', 'limited')
    and attempt.created_at >= now() - interval '15 minutes';
  if failures >= 5 then
    insert into public.business_data_private_verification_attempts (
      user_id, collection_id, channel, connection_id, customer_identity_hash, outcome
    )
    select id, p_channel, p_connection_id, p_customer_identity_hash, 'limited'
    from public.business_data_collections
    where user_id = p_user_id and key = p_collection_key;
    return false;
  end if;

  select collection.* into collection_row
  from public.business_data_collections collection
  where collection.user_id = p_user_id
    and collection.key = p_collection_key
    and collection.access_scope = 'verified_customer'
    and collection.ai_enabled
    and collection.status = 'active';
  if found and public.business_data_private_config_is_valid(collection_row.id, p_user_id) then
    select field_definition.* into verifier_field
    from public.business_data_private_access_configs config
    join public.business_data_fields field_definition
      on field_definition.id = config.verification_field_id
    where config.collection_id = collection_row.id
      and config.user_id = p_user_id
      and config.enabled;

    select exists (
      select 1
      from public.business_data_records record
      where record.id = p_candidate_record_id
        and record.user_id = p_user_id
        and record.collection_id = collection_row.id
        and record.status = 'active'
        and public.business_data_normalize_verification_value(
          record.values ->> verifier_field.key,
          verifier_field.semantic_role
        ) = public.business_data_normalize_verification_value(
          p_verification_value,
          verifier_field.semantic_role
        )
    ) into verified;
  end if;

  insert into public.business_data_private_verification_attempts (
    user_id, collection_id, channel, connection_id, customer_identity_hash, outcome
  )
  select id, p_channel, p_connection_id, p_customer_identity_hash,
    case when verified then 'success' else 'failure' end
  from public.business_data_collections
  where user_id = p_user_id and key = p_collection_key;

  if not verified then return false; end if;

  insert into public.business_data_verified_customer_sessions (
    user_id, collection_id, record_id, channel, connection_id,
    customer_identity_hash, verified_at, expires_at
  ) values (
    p_user_id, collection_row.id, p_candidate_record_id, p_channel,
    p_connection_id, p_customer_identity_hash, now(), now() + interval '10 minutes'
  )
  on conflict (user_id, collection_id, channel, connection_id, customer_identity_hash)
  do update set
    record_id = excluded.record_id,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;

  return true;
end;
$$;

revoke execute on function public.business_data_private_verify(uuid, text, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.business_data_private_verify(uuid, text, uuid, text, text, uuid, text)
  to service_role;

-- Result-returning private verification helpers deliberately expose only
-- sanitized state codes to the server. Customer-facing code maps every
-- mismatch to the same neutral language and never returns these codes.
create or replace function public.business_data_private_find_candidate_result(
  p_user_id uuid,
  p_collection_key text,
  p_locator_value text,
  p_channel text,
  p_connection_id uuid,
  p_customer_identity_hash text
)
returns table(outcome text, candidate_record_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  collection_row public.business_data_collections%rowtype;
  locator_field public.business_data_fields%rowtype;
  matched_record_id uuid;
  candidate_count integer := 0;
  failures integer := 0;
begin
  if p_collection_key is null or char_length(p_collection_key) > 64
    or p_locator_value is null or char_length(p_locator_value) > 200
    or p_channel not in ('telegram', 'instagram')
    or p_customer_identity_hash !~ '^[0-9a-f]{64}$' then
    return query select 'config_invalid'::text, null::uuid;
    return;
  end if;

  select collection.* into collection_row
  from public.business_data_collections collection
  where collection.user_id = p_user_id
    and collection.key = p_collection_key
    and collection.access_scope = 'verified_customer'
    and collection.ai_enabled
    and collection.status = 'active';
  if not found or not public.business_data_private_config_is_valid(collection_row.id, p_user_id) then
    return query select 'config_invalid'::text, null::uuid;
    return;
  end if;

  select count(*) into failures
  from public.business_data_private_verification_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.collection_id = collection_row.id
    and attempt.channel = p_channel
    and attempt.connection_id = p_connection_id
    and attempt.customer_identity_hash = p_customer_identity_hash
    and attempt.outcome in ('failure', 'limited')
    and attempt.created_at >= now() - interval '15 minutes';
  if failures >= 5 then
    insert into public.business_data_private_verification_attempts (
      user_id, collection_id, channel, connection_id, customer_identity_hash, outcome, reason
    ) values (
      p_user_id, collection_row.id, p_channel, p_connection_id, p_customer_identity_hash,
      'limited', 'rate_limited'
    );
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  select field_definition.* into locator_field
  from public.business_data_private_access_configs config
  join public.business_data_fields field_definition
    on field_definition.id = config.locator_field_id
  where config.collection_id = collection_row.id
    and config.user_id = p_user_id
    and config.enabled;

  select count(*) into candidate_count
  from public.business_data_records record
  where record.user_id = p_user_id
    and record.collection_id = collection_row.id
    and record.status = 'active'
    and public.business_data_normalize_verification_value(
      record.values ->> locator_field.key,
      locator_field.semantic_role
    ) = public.business_data_normalize_verification_value(
      p_locator_value,
      locator_field.semantic_role
    );
  if candidate_count <> 1 then
    insert into public.business_data_private_verification_attempts (
      user_id, collection_id, channel, connection_id, customer_identity_hash, outcome, reason
    ) values (
      p_user_id, collection_row.id, p_channel, p_connection_id, p_customer_identity_hash,
      'failure', 'no_candidate'
    );
    return query select 'no_candidate'::text, null::uuid;
    return;
  end if;

  select record.id into matched_record_id
  from public.business_data_records record
  where record.user_id = p_user_id
    and record.collection_id = collection_row.id
    and record.status = 'active'
    and public.business_data_normalize_verification_value(
      record.values ->> locator_field.key,
      locator_field.semantic_role
    ) = public.business_data_normalize_verification_value(
      p_locator_value,
      locator_field.semantic_role
    );
  return query select 'locator_accepted'::text, matched_record_id;
end;
$$;

revoke execute on function public.business_data_private_find_candidate_result(uuid, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.business_data_private_find_candidate_result(uuid, text, text, text, uuid, text)
  to service_role;

create or replace function public.business_data_private_verify_result(
  p_user_id uuid,
  p_collection_key text,
  p_candidate_record_id uuid,
  p_verification_value text,
  p_channel text,
  p_connection_id uuid,
  p_customer_identity_hash text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  collection_row public.business_data_collections%rowtype;
  verifier_field public.business_data_fields%rowtype;
  stored_value text;
  verified boolean := false;
  failures integer := 0;
begin
  if p_collection_key is null or char_length(p_collection_key) > 64
    or p_verification_value is null or char_length(p_verification_value) > 200
    or p_channel not in ('telegram', 'instagram')
    or p_customer_identity_hash !~ '^[0-9a-f]{64}$' then
    return 'config_invalid';
  end if;

  select collection.* into collection_row
  from public.business_data_collections collection
  where collection.user_id = p_user_id
    and collection.key = p_collection_key
    and collection.access_scope = 'verified_customer'
    and collection.ai_enabled
    and collection.status = 'active';
  if not found or not public.business_data_private_config_is_valid(collection_row.id, p_user_id) then
    return 'config_invalid';
  end if;

  select count(*) into failures
  from public.business_data_private_verification_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.collection_id = collection_row.id
    and attempt.channel = p_channel
    and attempt.connection_id = p_connection_id
    and attempt.customer_identity_hash = p_customer_identity_hash
    and attempt.outcome in ('failure', 'limited')
    and attempt.created_at >= now() - interval '15 minutes';
  if failures >= 5 then
    insert into public.business_data_private_verification_attempts (
      user_id, collection_id, channel, connection_id, customer_identity_hash, outcome, reason
    ) values (
      p_user_id, collection_row.id, p_channel, p_connection_id, p_customer_identity_hash,
      'limited', 'rate_limited'
    );
    return 'rate_limited';
  end if;

  select field_definition.* into verifier_field
  from public.business_data_private_access_configs config
  join public.business_data_fields field_definition
    on field_definition.id = config.verification_field_id
  where config.collection_id = collection_row.id
    and config.user_id = p_user_id
    and config.enabled;

  select record.values ->> verifier_field.key into stored_value
  from public.business_data_records record
  where record.id = p_candidate_record_id
    and record.user_id = p_user_id
    and record.collection_id = collection_row.id
    and record.status = 'active';
  if not found or public.business_data_normalize_verification_value(stored_value, verifier_field.semantic_role) = '' then
    insert into public.business_data_private_verification_attempts (
      user_id, collection_id, channel, connection_id, customer_identity_hash, outcome, reason
    ) values (
      p_user_id, collection_row.id, p_channel, p_connection_id, p_customer_identity_hash,
      'failure', 'missing_stored_value'
    );
    return 'missing_stored_value';
  end if;

  verified := public.business_data_normalize_verification_value(
    stored_value, verifier_field.semantic_role
  ) = public.business_data_normalize_verification_value(
    p_verification_value, verifier_field.semantic_role
  );
  insert into public.business_data_private_verification_attempts (
    user_id, collection_id, channel, connection_id, customer_identity_hash, outcome, reason
  ) values (
    p_user_id, collection_row.id, p_channel, p_connection_id, p_customer_identity_hash,
    case when verified then 'success' else 'failure' end,
    case when verified then null else 'verifier_mismatch' end
  );
  if not verified then return 'verifier_mismatch'; end if;

  insert into public.business_data_verified_customer_sessions (
    user_id, collection_id, record_id, channel, connection_id,
    customer_identity_hash, verified_at, expires_at
  ) values (
    p_user_id, collection_row.id, p_candidate_record_id, p_channel,
    p_connection_id, p_customer_identity_hash, now(), now() + interval '10 minutes'
  )
  on conflict (user_id, collection_id, channel, connection_id, customer_identity_hash)
  do update set
    record_id = excluded.record_id,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;
  return 'verified';
end;
$$;

revoke execute on function public.business_data_private_verify_result(uuid, text, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.business_data_private_verify_result(uuid, text, uuid, text, text, uuid, text)
  to service_role;

create or replace function public.business_data_private_access_diagnostics(
  p_user_id uuid,
  p_collection_id uuid,
  p_locator_field_id uuid,
  p_verification_field_id uuid
)
returns table(
  configuration_valid boolean,
  active_record_count bigint,
  locator_missing_count bigint,
  verification_missing_count bigint,
  recent_reason text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  locator_field public.business_data_fields%rowtype;
  verifier_field public.business_data_fields%rowtype;
begin
  select field_definition.* into locator_field
  from public.business_data_fields field_definition
  where field_definition.id = p_locator_field_id
    and field_definition.collection_id = p_collection_id
    and field_definition.user_id = p_user_id;
  select field_definition.* into verifier_field
  from public.business_data_fields field_definition
  where field_definition.id = p_verification_field_id
    and field_definition.collection_id = p_collection_id
    and field_definition.user_id = p_user_id;

  configuration_valid := locator_field.id is not null and verifier_field.id is not null
    and locator_field.required and locator_field.filterable and locator_field.ai_exposure = 'filter_only'
    and verifier_field.required and verifier_field.filterable and verifier_field.ai_exposure = 'filter_only'
    and locator_field.id <> verifier_field.id
    and locator_field.semantic_role in ('reference', 'tracking', 'account_identifier', 'customer_identifier', 'channel_identifier')
    and verifier_field.semantic_role in ('phone', 'email', 'customer_identifier', 'account_identifier', 'channel_identifier');
  select count(*) into active_record_count
  from public.business_data_records record
  where record.user_id = p_user_id and record.collection_id = p_collection_id and record.status = 'active';
  if configuration_valid then
    select count(*) into locator_missing_count
    from public.business_data_records record
    where record.user_id = p_user_id and record.collection_id = p_collection_id and record.status = 'active'
      and public.business_data_normalize_verification_value(record.values ->> locator_field.key, locator_field.semantic_role) = '';
    select count(*) into verification_missing_count
    from public.business_data_records record
    where record.user_id = p_user_id and record.collection_id = p_collection_id and record.status = 'active'
      and public.business_data_normalize_verification_value(record.values ->> verifier_field.key, verifier_field.semantic_role) = '';
  else
    locator_missing_count := 0;
    verification_missing_count := 0;
  end if;
  select attempt.reason into recent_reason
  from public.business_data_private_verification_attempts attempt
  where attempt.user_id = p_user_id and attempt.collection_id = p_collection_id
    and attempt.reason is not null
  order by attempt.created_at desc
  limit 1;
  return next;
end;
$$;

revoke execute on function public.business_data_private_access_diagnostics(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.business_data_private_access_diagnostics(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function public.business_data_lookup_verified_customer(
  p_user_id uuid,
  p_collection_key text,
  p_channel text,
  p_connection_id uuid,
  p_customer_identity_hash text,
  p_projection_keys jsonb
)
returns table (
  record_values jsonb,
  data_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  collection_row public.business_data_collections%rowtype;
  session_record_id uuid;
  projection_key text;
begin
  if p_collection_key is null or char_length(p_collection_key) > 64
    or p_channel not in ('telegram', 'instagram')
    or p_customer_identity_hash !~ '^[0-9a-f]{64}$'
    or p_projection_keys is null
    or jsonb_typeof(p_projection_keys) <> 'array'
    or jsonb_array_length(p_projection_keys) < 1
    or jsonb_array_length(p_projection_keys) > 6 then
    return;
  end if;

  select collection.* into collection_row
  from public.business_data_collections collection
  where collection.user_id = p_user_id
    and collection.key = p_collection_key
    and collection.access_scope = 'verified_customer'
    and collection.ai_enabled
    and collection.status = 'active';
  if not found or not public.business_data_private_config_is_valid(collection_row.id, p_user_id) then
    return;
  end if;

  select session.record_id into session_record_id
  from public.business_data_verified_customer_sessions session
  where session.user_id = p_user_id
    and session.collection_id = collection_row.id
    and session.channel = p_channel
    and session.connection_id = p_connection_id
    and session.customer_identity_hash = p_customer_identity_hash
    and session.expires_at > now();
  if session_record_id is null then return; end if;

  for projection_key in
    select projection_item.value #>> '{}'
    from jsonb_array_elements(p_projection_keys) as projection_item(value)
  loop
    if projection_key is null or not exists (
      select 1 from public.business_data_fields field_definition
      where field_definition.user_id = p_user_id
        and field_definition.collection_id = collection_row.id
        and field_definition.key = projection_key
        and field_definition.ai_exposure = 'answer'
    ) then
      return;
    end if;
  end loop;

  return query
  select
    coalesce(jsonb_object_agg(
      field_definition.key,
      record.values -> field_definition.key
      order by field_definition.position
    ) filter (where record.values ? field_definition.key), '{}'::jsonb),
    coalesce(record.source_updated_at, record.updated_at)
  from public.business_data_records record
  join public.business_data_fields field_definition
    on field_definition.user_id = p_user_id
   and field_definition.collection_id = collection_row.id
   and field_definition.ai_exposure = 'answer'
   and field_definition.key in (
     select projection_item.value #>> '{}'
     from jsonb_array_elements(p_projection_keys) as projection_item(value)
   )
  where record.id = session_record_id
    and record.user_id = p_user_id
    and record.collection_id = collection_row.id
    and record.status = 'active'
  having count(record.id) > 0;
end;
$$;

revoke execute on function public.business_data_lookup_verified_customer(
  uuid, text, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.business_data_lookup_verified_customer(
  uuid, text, text, uuid, text, jsonb
) to service_role;

alter table public.business_data_private_access_configs enable row level security;
alter table public.business_data_private_verification_challenges enable row level security;
alter table public.business_data_verified_customer_sessions enable row level security;
alter table public.business_data_private_verification_attempts enable row level security;

revoke all on table public.business_data_private_access_configs,
  public.business_data_private_verification_challenges,
  public.business_data_verified_customer_sessions,
  public.business_data_private_verification_attempts
  from anon, authenticated;

grant select, insert, update, delete
  on table public.business_data_collections to service_role;
grant select, insert, update, delete
  on table public.business_data_fields to service_role;
grant select, insert, update, delete
  on table public.business_data_sources to service_role;
grant select, insert, update, delete
  on table public.business_data_records to service_role;
grant select, insert, update, delete
  on table public.business_data_source_secrets to service_role;
grant select, insert, update, delete
  on table public.business_data_sync_runs to service_role;

-- 11) Existing site-admin boundary hardening ----------------------------------
--
-- profiles.is_admin is trusted by server-side administration routes. The old
-- table-level UPDATE grant let an authenticated owner update any column on
-- their own profile row, including is_admin when that column exists. Keep the
-- existing owner RLS policy, but narrow the Postgres grant to the columns the
-- dashboard legitimately edits. Onboarding completion uses service_role and
-- is unaffected.

revoke update on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, business_name, heard_from)
  on table public.profiles to authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'business_category'
  ) then
    execute 'grant update (business_category) on table public.profiles to authenticated';
  end if;
end;
$$;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
