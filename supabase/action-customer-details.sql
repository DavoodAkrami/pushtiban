-- =============================================================================
-- Pushtiban — customer details for order and reservation actions
--
-- Adds the standard details that a customer must provide before a new order or
-- reservation is confirmed. Existing historical records are intentionally
-- untouched; only newly created action records must contain these fields.
-- Safe to run more than once.
-- =============================================================================

with desired_fields (
  collection_kind,
  key,
  label,
  data_type,
  semantic_role,
  required,
  searchable,
  filterable,
  ai_exposure,
  ordinal
) as (
  values
    ('order'::text, 'customer_name', 'نام گیرنده', 'text', 'custom', true, false, false, 'hidden', 1),
    ('order'::text, 'phone', 'شماره تماس', 'text', 'phone', true, false, true, 'filter_only', 2),
    ('order'::text, 'address', 'نشانی تحویل', 'long_text', 'location', true, false, false, 'hidden', 3),
    ('reservation'::text, 'customer_name', 'نام رزروکننده', 'text', 'custom', true, false, false, 'hidden', 1),
    ('reservation'::text, 'phone', 'شماره تماس', 'text', 'phone', true, false, true, 'filter_only', 2)
),
missing_fields as (
  select
    collection.user_id,
    collection.id as collection_id,
    desired.key,
    desired.label,
    desired.data_type,
    desired.semantic_role,
    desired.required,
    desired.searchable,
    desired.filterable,
    desired.ai_exposure,
    desired.ordinal
  from public.business_data_collections collection
  join desired_fields desired
    on desired.collection_kind = collection.kind
  where collection.status = 'active'
    and not exists (
      select 1
      from public.business_data_fields field_definition
      where field_definition.collection_id = collection.id
        and field_definition.key = desired.key
    )
),
numbered_fields as (
  select
    missing.*,
    coalesce(existing.max_position, -1)
      + row_number() over (
          partition by missing.collection_id
          order by missing.ordinal
        ) as position
  from missing_fields missing
  left join lateral (
    select max(field_definition.position) as max_position
    from public.business_data_fields field_definition
    where field_definition.collection_id = missing.collection_id
  ) existing on true
)
insert into public.business_data_fields (
  user_id,
  collection_id,
  key,
  label,
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
  user_id,
  collection_id,
  key,
  label,
  data_type,
  semantic_role,
  required,
  searchable,
  filterable,
  ai_exposure,
  position,
  '{}'::jsonb
from numbered_fields;
