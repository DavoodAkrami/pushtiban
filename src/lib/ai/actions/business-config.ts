import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BusinessDataAccessScope,
  BusinessDataCollectionKind,
  BusinessDataFieldRole,
  BusinessDataFieldType,
} from "@/lib/business-data/types";

export type BusinessActionKey =
  | "check_availability"
  | "create_reservation"
  | "cancel_reservation"
  | "create_order"
  | "cancel_order";

export type BusinessActionFieldConcept = {
  key: string;
  label: string;
  side: "primary" | "related";
  required: boolean;
  types: BusinessDataFieldType[];
  roles?: BusinessDataFieldRole[];
};

export type BusinessActionConfigurationSpec = {
  primaryLabel: string;
  primaryKinds: BusinessDataCollectionKind[];
  primaryAccessScopes?: BusinessDataAccessScope[];
  relatedLabel?: string;
  relatedKinds?: BusinessDataCollectionKind[];
  relatedAccessScopes?: BusinessDataAccessScope[];
  fields: BusinessActionFieldConcept[];
  cancellationValue?: boolean;
};

const textTypes: BusinessDataFieldType[] = ["text", "long_text", "select"];
const dateTypes: BusinessDataFieldType[] = ["date", "datetime", "text"];
const numberTypes: BusinessDataFieldType[] = ["number", "currency"];

export const BUSINESS_ACTION_CONFIGURATION_SPECS: Record<
  BusinessActionKey,
  BusinessActionConfigurationSpec
> = {
  check_availability: {
    primaryLabel: "داده زنده ظرفیت",
    primaryKinds: ["availability", "reservation"],
    fields: [
      { key: "date", label: "تاریخ", side: "primary", required: true, types: dateTypes, roles: ["start_at"] },
      { key: "time", label: "ساعت", side: "primary", required: true, types: dateTypes, roles: ["start_at"] },
      { key: "available", label: "وضعیت ظرفیت", side: "primary", required: true, types: ["boolean", "select", "text"], roles: ["availability", "status"] },
      { key: "remaining_capacity", label: "ظرفیت باقی‌مانده", side: "primary", required: false, types: ["number"], roles: ["quantity", "availability"] },
    ],
  },
  create_reservation: {
    primaryLabel: "مقصد ثبت رزرو",
    primaryKinds: ["reservation"],
    fields: [
      { key: "date", label: "تاریخ رزرو", side: "primary", required: true, types: dateTypes, roles: ["start_at"] },
      { key: "time", label: "ساعت رزرو", side: "primary", required: true, types: dateTypes, roles: ["start_at"] },
      { key: "party_size", label: "تعداد نفرات", side: "primary", required: true, types: ["number"], roles: ["quantity"] },
      { key: "customer_name", label: "نام مشتری", side: "primary", required: true, types: textTypes, roles: ["title"] },
      { key: "customer_contact", label: "راه تماس مشتری", side: "primary", required: true, types: textTypes, roles: ["phone", "email", "customer_identifier"] },
      { key: "execution_id", label: "شناسه یکتای عملیات", side: "primary", required: true, types: textTypes, roles: ["reference"] },
      { key: "status", label: "وضعیت اولیه", side: "primary", required: false, types: textTypes, roles: ["status"] },
    ],
  },
  cancel_reservation: {
    primaryLabel: "رزروهای مشتری",
    primaryKinds: ["reservation"],
    primaryAccessScopes: ["verified_customer"],
    cancellationValue: true,
    fields: [
      { key: "status", label: "وضعیت رزرو", side: "primary", required: true, types: textTypes, roles: ["status"] },
    ],
  },
  create_order: {
    primaryLabel: "مقصد ثبت سفارش",
    primaryKinds: ["order"],
    relatedLabel: "فهرست محصولات",
    relatedKinds: ["product", "menu_item"],
    relatedAccessScopes: ["public_catalog"],
    fields: [
      { key: "destination_product_reference", label: "شناسه محصول در سفارش", side: "primary", required: true, types: textTypes, roles: ["reference", "sku"] },
      { key: "destination_quantity", label: "تعداد سفارش", side: "primary", required: true, types: ["number"], roles: ["quantity"] },
      { key: "destination_unit_price", label: "قیمت واحد", side: "primary", required: true, types: numberTypes, roles: ["price"] },
      { key: "destination_total_price", label: "مبلغ کل", side: "primary", required: false, types: numberTypes, roles: ["price"] },
      { key: "destination_customer_name", label: "نام مشتری", side: "primary", required: true, types: textTypes, roles: ["title"] },
      { key: "destination_customer_contact", label: "راه تماس مشتری", side: "primary", required: true, types: textTypes, roles: ["phone", "email", "customer_identifier"] },
      { key: "execution_id", label: "شناسه یکتای عملیات", side: "primary", required: true, types: textTypes, roles: ["reference"] },
      { key: "destination_status", label: "وضعیت اولیه", side: "primary", required: false, types: textTypes, roles: ["status"] },
      { key: "product_name", label: "نام محصول", side: "related", required: true, types: textTypes, roles: ["title"] },
      { key: "product_reference", label: "شناسه محصول", side: "related", required: true, types: textTypes, roles: ["sku", "reference"] },
      { key: "product_price", label: "قیمت فعلی محصول", side: "related", required: true, types: numberTypes, roles: ["price"] },
      { key: "product_currency", label: "واحد پول", side: "related", required: false, types: textTypes, roles: ["currency"] },
      { key: "product_available", label: "وضعیت موجودی", side: "related", required: false, types: ["boolean", "select", "text"], roles: ["availability", "status"] },
      { key: "product_stock", label: "تعداد موجود", side: "related", required: false, types: ["number"], roles: ["quantity", "availability"] },
    ],
  },
  cancel_order: {
    primaryLabel: "سفارش‌های مشتری",
    primaryKinds: ["order"],
    primaryAccessScopes: ["verified_customer"],
    cancellationValue: true,
    fields: [
      { key: "status", label: "وضعیت سفارش", side: "primary", required: true, types: textTypes, roles: ["status"] },
    ],
  },
};

export type BusinessActionCatalogField = {
  key: string;
  label: string;
  type: BusinessDataFieldType;
  role: BusinessDataFieldRole;
};

type BusinessActionCatalogSource = {
  id: string;
  name: string;
  status: string;
  tableName: string;
  externalIdField: string | null;
  fieldMapping: Record<string, string | null>;
};

export type BusinessActionCatalogCollection = {
  id: string;
  name: string;
  kind: BusinessDataCollectionKind;
  accessScope: BusinessDataAccessScope;
  aiEnabled: boolean;
  status: string;
  fields: BusinessActionCatalogField[];
  source: BusinessActionCatalogSource | null;
  privateAccessReady: boolean;
};

export type StoredBusinessActionConfiguration = {
  collectionId: string | null;
  sourceId: string | null;
  relatedCollectionId: string | null;
  fieldMapping: Record<string, string>;
  cancellationValue: string | null;
};

export type ResolvedBusinessActionConfiguration = StoredBusinessActionConfiguration & {
  actionKey: BusinessActionKey;
  primary: BusinessActionCatalogCollection;
  related: BusinessActionCatalogCollection | null;
  source: BusinessActionCatalogSource;
};

const configurationCache = new Map<
  string,
  {
    expiresAt: number;
    value: Map<BusinessActionKey, ResolvedBusinessActionConfiguration>;
  }
>();
const CONFIGURATION_CACHE_TTL_MS = 30_000;

export const invalidateBusinessActionConfigurations = (userId: string) => {
  configurationCache.delete(userId);
};

type CollectionRow = {
  id: string;
  name: string;
  kind: BusinessDataCollectionKind;
  access_scope: BusinessDataAccessScope;
  ai_enabled: boolean;
  status: string;
};

type FieldRow = {
  collection_id: string;
  key: string;
  label: string;
  data_type: BusinessDataFieldType;
  semantic_role: BusinessDataFieldRole;
};

type SourceRow = {
  id: string;
  collection_id: string;
  name: string;
  status: string;
  configuration: Record<string, unknown>;
  field_mapping: Record<string, string | null>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const loadCatalog = async (userId: string): Promise<BusinessActionCatalogCollection[]> => {
  const admin = createAdminClient();
  const { data: collections, error: collectionError } = await admin
    .from("business_data_collections")
    .select("id, name, kind, access_scope, ai_enabled, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (collectionError) throw new Error("Action collection catalog failed.");
  const rows = (collections ?? []) as CollectionRow[];
  if (!rows.length) return [];
  const ids = rows.map((collection) => collection.id);
  const [fieldResult, sourceResult, privateResult] = await Promise.all([
    admin
      .from("business_data_fields")
      .select("collection_id, key, label, data_type, semantic_role")
      .eq("user_id", userId)
      .in("collection_id", ids)
      .order("position", { ascending: true }),
    admin
      .from("business_data_sources")
      .select("id, collection_id, name, status, configuration, field_mapping")
      .eq("user_id", userId)
      .eq("source_type", "supabase")
      .in("collection_id", ids),
    admin
      .from("business_data_private_access_configs")
      .select("collection_id")
      .eq("user_id", userId)
      .eq("enabled", true)
      .in("collection_id", ids),
  ]);
  if (fieldResult.error || sourceResult.error || privateResult.error) {
    throw new Error("Action capability catalog failed.");
  }
  const fields = (fieldResult.data ?? []) as FieldRow[];
  const sources = (sourceResult.data ?? []) as SourceRow[];
  const privateIds = new Set(
    (privateResult.data ?? []).map((row) => String(row.collection_id))
  );
  return rows.map((collection) => {
    const sourceRow = sources.find(
      (source) =>
        source.collection_id === collection.id &&
        ["ready", "pending"].includes(source.status)
    );
    const tableName = sourceRow?.configuration?.tableName;
    const externalIdField = sourceRow?.configuration?.externalIdField;
    return {
      id: collection.id,
      name: collection.name,
      kind: collection.kind,
      accessScope: collection.access_scope,
      aiEnabled: collection.ai_enabled,
      status: collection.status,
      fields: fields
        .filter((field) => field.collection_id === collection.id)
        .map((field) => ({
          key: field.key,
          label: field.label,
          type: field.data_type,
          role: field.semantic_role,
        })),
      source:
        sourceRow && typeof tableName === "string" && tableName
          ? {
              id: sourceRow.id,
              name: sourceRow.name,
              status: sourceRow.status,
              tableName,
              externalIdField:
                typeof externalIdField === "string" && externalIdField
                  ? externalIdField
                  : null,
              fieldMapping: isPlainObject(sourceRow.field_mapping)
                ? Object.fromEntries(
                    Object.entries(sourceRow.field_mapping).map(([key, value]) => [
                      key,
                      typeof value === "string" ? value : null,
                    ])
                  )
                : {},
            }
          : null,
      privateAccessReady: privateIds.has(collection.id),
    };
  });
};

const parseFieldMapping = (value: unknown) => {
  if (!isPlainObject(value) || Object.keys(value).length > 24) return null;
  const result: Record<string, string> = {};
  for (const [key, fieldKey] of Object.entries(value)) {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(key) ||
      typeof fieldKey !== "string" ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(fieldKey)
    ) {
      return null;
    }
    result[key] = fieldKey;
  }
  return result;
};

const fieldForConcept = (
  concept: BusinessActionFieldConcept,
  mapping: Record<string, string>,
  primary: BusinessActionCatalogCollection,
  related: BusinessActionCatalogCollection | null
) => {
  const collection = concept.side === "primary" ? primary : related;
  const field = collection?.fields.find((candidate) => candidate.key === mapping[concept.key]);
  return field && concept.types.includes(field.type) ? field : null;
};

const compatibleCollection = (
  collection: BusinessActionCatalogCollection | undefined,
  kinds: BusinessDataCollectionKind[],
  accessScopes?: BusinessDataAccessScope[]
) =>
  Boolean(
    collection &&
      kinds.includes(collection.kind) &&
      (!accessScopes || accessScopes.includes(collection.accessScope))
  );

const resolveAgainstCatalog = ({
  actionKey,
  cancellationValue,
  collectionId,
  fieldMapping,
  relatedCollectionId,
  sourceId,
}: StoredBusinessActionConfiguration & { actionKey: BusinessActionKey }, catalog: BusinessActionCatalogCollection[]) => {
  const spec = BUSINESS_ACTION_CONFIGURATION_SPECS[actionKey];
  const primary = catalog.find((collection) => collection.id === collectionId);
  const related = relatedCollectionId
    ? catalog.find((collection) => collection.id === relatedCollectionId) ?? null
    : null;
  const source = primary?.source;
  if (
    !compatibleCollection(primary, spec.primaryKinds, spec.primaryAccessScopes) ||
    !source ||
    source.id !== sourceId ||
    (spec.primaryAccessScopes?.includes("verified_customer") &&
      (!primary.privateAccessReady || !primary.aiEnabled)) ||
    (spec.relatedKinds &&
      (!compatibleCollection(related ?? undefined, spec.relatedKinds, spec.relatedAccessScopes) ||
        related?.aiEnabled !== true)) ||
    spec.fields.some(
      (concept) =>
        concept.required &&
        !fieldForConcept(concept, fieldMapping, primary, related)
    ) ||
    spec.fields.some(
      (concept) =>
        concept.side === "primary" &&
        fieldMapping[concept.key] &&
        !Object.values(source.fieldMapping).includes(
          fieldMapping[concept.key]
        )
    ) ||
    (spec.cancellationValue &&
      (!cancellationValue || cancellationValue.length > 80))
  ) {
    return null;
  }
  if (
    spec.primaryAccessScopes?.includes("verified_customer") &&
    (!source.externalIdField ||
      !Object.values(source.fieldMapping).includes(
        source.externalIdField
      ))
  ) {
    return null;
  }
  return {
    actionKey,
    collectionId: primary.id,
    sourceId: source.id,
    relatedCollectionId: related?.id ?? null,
    fieldMapping,
    cancellationValue,
    primary,
    related,
    source,
  } satisfies ResolvedBusinessActionConfiguration;
};

export const resolveBusinessActionConfigurations = async (userId: string) => {
  const cached = configurationCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const actionKeys = Object.keys(
    BUSINESS_ACTION_CONFIGURATION_SPECS
  ) as BusinessActionKey[];
  const [catalog, settingsResult] = await Promise.all([
    loadCatalog(userId),
    createAdminClient()
      .from("business_action_settings")
      .select(
        "action_key, collection_id, source_id, related_collection_id, field_mapping, configuration"
      )
      .eq("user_id", userId)
      .in("action_key", actionKeys),
  ]);
  if (settingsResult.error) {
    return new Map<BusinessActionKey, ResolvedBusinessActionConfiguration>();
  }
  const resolved = new Map<BusinessActionKey, ResolvedBusinessActionConfiguration>();
  for (const row of settingsResult.data ?? []) {
    if (!isBusinessActionKey(String(row.action_key))) continue;
    const fieldMapping = parseFieldMapping(row.field_mapping);
    const configuration = isPlainObject(row.configuration) ? row.configuration : {};
    if (!fieldMapping) continue;
    const candidate = resolveAgainstCatalog(
      {
        actionKey: row.action_key,
        collectionId:
          typeof row.collection_id === "string" ? row.collection_id : null,
        sourceId: typeof row.source_id === "string" ? row.source_id : null,
        relatedCollectionId:
          typeof row.related_collection_id === "string"
            ? row.related_collection_id
            : null,
        fieldMapping,
        cancellationValue:
          typeof configuration.cancellationValue === "string"
            ? configuration.cancellationValue
            : null,
      },
      catalog
    );
    if (candidate) resolved.set(row.action_key, candidate);
  }
  configurationCache.set(userId, {
    expiresAt: Date.now() + CONFIGURATION_CACHE_TTL_MS,
    value: resolved,
  });
  return resolved;
};

export const resolveBusinessActionConfiguration = async (
  userId: string,
  actionKey: BusinessActionKey
): Promise<ResolvedBusinessActionConfiguration | null> => {
  const configurations = await resolveBusinessActionConfigurations(userId);
  return configurations.get(actionKey) ?? null;
};

export const parseBusinessActionConfigurationUpdate = async ({
  actionKey,
  input,
  userId,
}: {
  actionKey: BusinessActionKey;
  input: unknown;
  userId: string;
}) => {
  if (!isPlainObject(input)) return null;
  const collectionId =
    typeof input.collectionId === "string" ? input.collectionId : null;
  const relatedCollectionId =
    typeof input.relatedCollectionId === "string"
      ? input.relatedCollectionId
      : null;
  const fieldMapping = parseFieldMapping(input.fieldMapping);
  const cancellationValue =
    typeof input.cancellationValue === "string"
      ? input.cancellationValue.trim()
      : null;
  if (!collectionId || !fieldMapping) return null;
  const catalog = await loadCatalog(userId);
  const primary = catalog.find((collection) => collection.id === collectionId);
  if (!primary?.source) return null;
  return resolveAgainstCatalog(
    {
      actionKey,
      collectionId,
      sourceId: primary.source.id,
      relatedCollectionId,
      fieldMapping,
      cancellationValue,
    },
    catalog
  );
};

export const listSafeBusinessActionCatalog = async (userId: string) =>
  (await loadCatalog(userId)).map((collection) => ({
    id: collection.id,
    name: collection.name,
    kind: collection.kind,
    accessScope: collection.accessScope,
    aiEnabled: collection.aiEnabled,
    fields: collection.fields,
    source: collection.source
      ? {
          id: collection.source.id,
          name: collection.source.name,
          tableName: collection.source.tableName,
        }
      : null,
    privateAccessReady: collection.privateAccessReady,
  }));

export const isBusinessActionKey = (value: string): value is BusinessActionKey =>
  Object.hasOwn(BUSINESS_ACTION_CONFIGURATION_SPECS, value);
