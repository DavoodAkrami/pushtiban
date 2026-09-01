-- Business Data image support and Telegram product-card delivery metadata.
-- Safe to re-run after the base supabase/business-data.sql migration.

begin;

-- Record images stay private. The application service role uploads them and
-- creates short-lived signed URLs only after an owner or channel access check.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'business-data-images',
  'business-data-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
        field_definition.data_type = 'image'
        and jsonb_typeof(new.values -> field_definition.key) = 'array'
        and jsonb_array_length(new.values -> field_definition.key) = 0
      )
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
      when field_definition.data_type = 'image'
        then case
          when jsonb_typeof(new.values -> field_definition.key) <> 'array' then true
          else jsonb_array_length(new.values -> field_definition.key) > 5
            or exists (
              select 1
              from jsonb_array_elements(new.values -> field_definition.key) image_item(value)
              where jsonb_typeof(image_item.value) <> 'string'
                or char_length(image_item.value #>> '{}') > 160
                or image_item.value #>> '{}' !~ ('^' || new.user_id::text || '/' || new.collection_id::text || '/[0-9a-f-]{36}\.(jpe?g|png|webp)$')
            )
        end
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

drop function if exists public.business_data_lookup_public(
  uuid, text, text, jsonb, jsonb, jsonb, integer
);

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
  record_id uuid,
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
    record.id as record_id,
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
alter table public.business_data_fields
  drop constraint if exists business_data_fields_data_type_check;
alter table public.business_data_fields
  add constraint business_data_fields_data_type_check
  check (data_type in (
    'text', 'long_text', 'number', 'currency', 'boolean', 'date',
    'datetime', 'select', 'url', 'image'
  ));

alter table public.business_data_fields
  drop constraint if exists business_data_fields_semantic_role_check;
alter table public.business_data_fields
  add constraint business_data_fields_semantic_role_check
  check (semantic_role in (
    'title', 'description', 'category', 'sku', 'price', 'currency',
    'availability', 'status', 'reference', 'url', 'image', 'quantity', 'start_at',
    'end_at', 'location', 'customer_identifier', 'phone', 'email',
    'account_identifier', 'channel_identifier', 'tracking', 'internal_notes',
    'custom'
  ));

commit;
