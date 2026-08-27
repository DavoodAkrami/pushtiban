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

export type BusinessActionDestination =
  | "internal_business_data"
  | "external_supabase";

export type BusinessActionFieldConcept = {
  key: string;
  label: string;
  side: "primary" | "related";
  required: boolean;
  serverGenerated?: boolean;
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
      { key: "customer_name", label: "نام مشتری", side: "primary", required: true, serverGenerated: true, types: textTypes, roles: ["title"] },
      { key: "customer_contact", label: "راه تماس مشتری", side: "primary", required: true, types: textTypes, roles: ["phone", "email", "customer_identifier"] },
      { key: "execution_id", label: "شناسه یکتای عملیات", side: "primary", required: true, serverGenerated: true, types: textTypes, roles: ["reference"] },
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
      { key: "destination_customer_name", label: "نام مشتری", side: "primary", required: true, serverGenerated: true, types: textTypes, roles: ["title"] },
      { key: "destination_customer_contact", label: "راه تماس مشتری", side: "primary", required: true, types: textTypes, roles: ["phone", "email", "customer_identifier"] },
      { key: "execution_id", label: "شناسه یکتای عملیات", side: "primary", required: true, serverGenerated: true, types: textTypes, roles: ["reference"] },
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
  required: boolean;
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
  initialStatus: string | null;
  destination: BusinessActionDestination;
  stockTrackingEnabled: boolean;
};

export type ResolvedBusinessActionConfiguration = StoredBusinessActionConfiguration & {
  actionKey: BusinessActionKey;
  primary: BusinessActionCatalogCollection;
  related: BusinessActionCatalogCollection | null;
  source: BusinessActionCatalogSource | null;
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
  required: boolean;
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
      .select("collection_id, key, label, data_type, semantic_role, required")
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
          required: field.required,
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

export const isBusinessActionConceptRequired = (
  concept: BusinessActionFieldConcept,
  destination: BusinessActionDestination
) =>
  concept.required &&
  !(destination === "internal_business_data" && concept.serverGenerated);

const isInternalGeneratedCollectionField = (
  actionKey: BusinessActionKey,
  destination: BusinessActionDestination,
  field: BusinessActionCatalogField
) =>
  destination === "internal_business_data" &&
  ["create_order", "create_reservation"].includes(actionKey) &&
  (field.role === "title" || field.role === "reference");

const hasMappingConflict = (
  actionKey: BusinessActionKey,
  concepts: BusinessActionFieldConcept[],
  mapping: Record<string, string>,
  collection: BusinessActionCatalogCollection | null
) => {
  const seen = new Map<string, BusinessActionFieldConcept>();
  for (const concept of concepts) {
    const fieldKey = mapping[concept.key];
    if (!fieldKey) continue;
    const previous = seen.get(fieldKey);
    if (!previous) {
      seen.set(fieldKey, concept);
      continue;
    }
    const sharedDateTime =
      actionKey === "create_reservation" &&
      new Set([previous.key, concept.key]).size === 2 &&
      new Set([previous.key, concept.key]).has("date") &&
      new Set([previous.key, concept.key]).has("time") &&
      collection?.fields.find((field) => field.key === fieldKey)?.type === "datetime";
    if (!sharedDateTime) return true;
  }
  return false;
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

const isBusinessActionDestination = (
  value: unknown
): value is BusinessActionDestination =>
  value === "internal_business_data" || value === "external_supabase";

const resolveAgainstCatalog = ({
  actionKey,
  cancellationValue,
  collectionId,
  destination,
  fieldMapping,
  initialStatus,
  relatedCollectionId,
  sourceId,
  stockTrackingEnabled,
}: StoredBusinessActionConfiguration & { actionKey: BusinessActionKey }, catalog: BusinessActionCatalogCollection[]) => {
  const spec = BUSINESS_ACTION_CONFIGURATION_SPECS[actionKey];
  const primary = catalog.find((collection) => collection.id === collectionId);
  const related = relatedCollectionId
    ? catalog.find((collection) => collection.id === relatedCollectionId) ?? null
    : null;
  if (
    !primary ||
    !compatibleCollection(primary, spec.primaryKinds, spec.primaryAccessScopes)
  ) {
    return null;
  }
  const source = primary.source;
  const usesExternalSource = destination === "external_supabase";
  const requiresTrackedStock =
    actionKey === "create_order" &&
    destination === "internal_business_data" &&
    stockTrackingEnabled;
  const statusConcept =
    actionKey === "create_order" ? "destination_status" : "status";
  const writesInitialStatus =
    actionKey === "create_order" || actionKey === "create_reservation";
  const primaryConcepts = spec.fields.filter((concept) => concept.side === "primary");
  const relatedConcepts = spec.fields.filter((concept) => concept.side === "related");
  const primaryMappedFieldKeys = new Set(
    primaryConcepts
      .map((concept) => fieldMapping[concept.key])
      .filter(Boolean)
  );
  const writesRecords = ["create_order", "create_reservation"].includes(actionKey);
  const mapsGeneratedFieldToBusinessConcept =
    destination === "internal_business_data" &&
    writesRecords &&
    primaryConcepts.some((concept) => {
      if (concept.serverGenerated || !fieldMapping[concept.key]) return false;
      const field = primary.fields.find((candidate) => candidate.key === fieldMapping[concept.key]);
      return Boolean(field && isInternalGeneratedCollectionField(actionKey, destination, field));
    });
  if (
    (usesExternalSource && (!source || source.id !== sourceId)) ||
    (!usesExternalSource && sourceId !== null) ||
    (spec.primaryAccessScopes?.includes("verified_customer") &&
      (!primary.privateAccessReady || !primary.aiEnabled)) ||
    (spec.relatedKinds &&
      (!compatibleCollection(related ?? undefined, spec.relatedKinds, spec.relatedAccessScopes) ||
        related?.aiEnabled !== true)) ||
    spec.fields.some(
      (concept) =>
        isBusinessActionConceptRequired(concept, destination) &&
        !fieldForConcept(concept, fieldMapping, primary, related)
    ) ||
    (requiresTrackedStock &&
      !fieldForConcept(
        spec.fields.find((concept) => concept.key === "product_stock")!,
        fieldMapping,
        primary,
        related
      )) ||
    hasMappingConflict(actionKey, primaryConcepts, fieldMapping, primary) ||
    hasMappingConflict(actionKey, relatedConcepts, fieldMapping, related) ||
    mapsGeneratedFieldToBusinessConcept ||
    (destination === "internal_business_data" &&
      writesRecords &&
      primary.fields.some(
        (field) =>
          field.required &&
          !primaryMappedFieldKeys.has(field.key) &&
          !isInternalGeneratedCollectionField(actionKey, destination, field)
      )) ||
    spec.fields.some(
      (concept) =>
        usesExternalSource &&
        concept.side === "primary" &&
        fieldMapping[concept.key] &&
        !Object.values(source!.fieldMapping).includes(
          fieldMapping[concept.key]
        )
    ) ||
    (spec.cancellationValue &&
      (!cancellationValue || cancellationValue.length > 80)) ||
    (destination === "internal_business_data" &&
      writesInitialStatus &&
      fieldMapping[statusConcept] &&
      (!initialStatus || initialStatus.length > 80))
  ) {
    return null;
  }
  if (
    usesExternalSource &&
    spec.primaryAccessScopes?.includes("verified_customer") &&
    (!source!.externalIdField ||
      !Object.values(source!.fieldMapping).includes(
        source!.externalIdField
      ))
  ) {
    return null;
  }
  return {
    actionKey,
    collectionId: primary.id,
    sourceId: usesExternalSource ? source!.id : null,
    relatedCollectionId: related?.id ?? null,
    fieldMapping,
    cancellationValue,
    initialStatus,
    destination,
    stockTrackingEnabled,
    primary,
    related,
    source: usesExternalSource ? source! : null,
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
    const sourceId = typeof row.source_id === "string" ? row.source_id : null;
    const destination = isBusinessActionDestination(configuration.destination)
      ? configuration.destination
      : sourceId
        ? "external_supabase"
        : "internal_business_data";
    const candidate = resolveAgainstCatalog(
      {
        actionKey: row.action_key,
        collectionId:
          typeof row.collection_id === "string" ? row.collection_id : null,
        sourceId,
        relatedCollectionId:
          typeof row.related_collection_id === "string"
            ? row.related_collection_id
            : null,
        fieldMapping,
        cancellationValue:
          typeof configuration.cancellationValue === "string"
            ? configuration.cancellationValue
            : null,
        initialStatus:
          typeof configuration.initialStatus === "string"
            ? configuration.initialStatus
            : null,
        destination,
        stockTrackingEnabled:
          typeof configuration.stockTrackingEnabled === "boolean"
            ? configuration.stockTrackingEnabled
            : destination === "internal_business_data" &&
              row.action_key === "create_order",
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
  const initialStatus =
    typeof input.initialStatus === "string" ? input.initialStatus.trim() : null;
  const destination = isBusinessActionDestination(input.destination)
    ? input.destination
    : null;
  const stockTrackingEnabled =
    typeof input.stockTrackingEnabled === "boolean"
      ? input.stockTrackingEnabled
      : destination === "internal_business_data" && actionKey === "create_order";
  if (!collectionId || !fieldMapping || !destination) return null;
  const catalog = await loadCatalog(userId);
  const primary = catalog.find((collection) => collection.id === collectionId);
  if (!primary) return null;
  return resolveAgainstCatalog(
    {
      actionKey,
      collectionId,
      sourceId:
        destination === "external_supabase" ? primary.source?.id ?? null : null,
      relatedCollectionId,
      fieldMapping,
      cancellationValue,
      initialStatus,
      destination,
      stockTrackingEnabled,
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

export type BusinessActionPrerequisite = {
  code:
    | "ready"
    | "missing_products"
    | "missing_orders"
    | "missing_reservations"
    | "missing_fields"
    | "missing_private_access";
  statusLabel: string;
  message: string;
  missingFields: string[];
  cta: { label: string; href: string } | null;
};

type PrerequisiteCatalogCollection = Pick<
  BusinessActionCatalogCollection,
  "id" | "kind" | "accessScope" | "aiEnabled" | "privateAccessReady"
>;

const missingCollectionPrerequisite = (
  actionKey: BusinessActionKey,
  code: "missing_products" | "missing_orders" | "missing_reservations"
): BusinessActionPrerequisite => {
  if (code === "missing_products") {
    return {
      code,
      statusLabel: "نیاز به مجموعه محصولات",
      message: "برای ثبت سفارش، ابتدا مجموعه «محصولات» را ایجاد کنید.",
      missingFields: [],
      cta: { label: "ایجاد مجموعه محصولات", href: "/dashboard/data" },
    };
  }
  if (code === "missing_orders") {
    return {
      code,
      statusLabel: "نیاز به مجموعه سفارش‌ها",
      message:
        actionKey === "cancel_order"
          ? "برای لغو سفارش، ابتدا مجموعه «سفارش‌ها» را در داده‌های کسب‌وکار ایجاد کنید."
          : "برای ثبت سفارش، به یک مجموعه «سفارش‌ها» نیاز دارید تا سفارش‌های جدید در آن ذخیره شوند.",
      missingFields: [],
      cta: { label: "ایجاد مجموعه سفارش‌ها", href: "/dashboard/data" },
    };
  }
  return {
    code,
    statusLabel: "نیاز به مجموعه رزروها",
    message: "برای فعال کردن رزرو، ابتدا مجموعه «رزروها» را در داده‌های کسب‌وکار ایجاد کنید.",
    missingFields: [],
    cta: { label: "ایجاد مجموعه رزروها", href: "/dashboard/data" },
  };
};

export const buildBusinessActionPrerequisite = ({
  actionKey,
  catalog,
  configuration,
}: {
  actionKey: BusinessActionKey;
  catalog: PrerequisiteCatalogCollection[];
  configuration: { collectionId: string } | null;
}): BusinessActionPrerequisite => {
  const spec = BUSINESS_ACTION_CONFIGURATION_SPECS[actionKey];
  const primaryCollections = catalog.filter((collection) =>
    spec.primaryKinds.includes(collection.kind)
  );
  const relatedCollections = spec.relatedKinds
    ? catalog.filter(
        (collection) =>
          spec.relatedKinds!.includes(collection.kind) &&
          (!spec.relatedAccessScopes ||
            spec.relatedAccessScopes.includes(collection.accessScope)) &&
          collection.aiEnabled
      )
    : [];

  if (actionKey === "create_order" && relatedCollections.length === 0) {
    return missingCollectionPrerequisite(actionKey, "missing_products");
  }
  if (
    (actionKey === "create_order" || actionKey === "cancel_order") &&
    primaryCollections.length === 0
  ) {
    return missingCollectionPrerequisite(actionKey, "missing_orders");
  }
  if (
    ["check_availability", "create_reservation", "cancel_reservation"].includes(
      actionKey
    ) &&
    primaryCollections.length === 0
  ) {
    return missingCollectionPrerequisite(actionKey, "missing_reservations");
  }

  if (spec.primaryAccessScopes?.includes("verified_customer")) {
    const selected =
      primaryCollections.find(
        (collection) => collection.id === configuration?.collectionId
      ) ?? primaryCollections[0];
    if (!selected?.privateAccessReady || !selected.aiEnabled) {
      return {
        code: "missing_private_access",
        statusLabel: "نیاز به تنظیم تأیید هویت",
        message:
          actionKey === "cancel_order"
            ? "برای لغو سفارش، ابتدا دسترسی خصوصی مجموعه سفارش‌ها را تنظیم کنید تا پشتیبان فقط سفارش همان مشتری را تغییر دهد."
            : "برای لغو رزرو، ابتدا دسترسی خصوصی مجموعه رزروها را تنظیم کنید تا پشتیبان فقط رزرو همان مشتری را تغییر دهد.",
        missingFields: [],
        cta: {
          label: "تنظیم تأیید هویت",
          href: `/dashboard/data/${selected?.id ?? ""}/structure#private-access-heading`,
        },
      };
    }
  }

  if (!configuration) {
    return {
      code: "missing_fields",
      statusLabel: "نیاز به تکمیل فیلدها",
      message:
        actionKey === "create_order"
          ? "چند فیلد موردنیاز برای ثبت سفارش هنوز مشخص نشده‌اند."
          : actionKey === "create_reservation"
            ? "برای ثبت رزرو، اطلاعات موردنیاز را در مجموعه رزروها مشخص کنید."
            : "فیلدهای موردنیاز این اقدام هنوز مشخص نشده‌اند.",
      missingFields: spec.fields
        .filter((field) => field.required && !field.serverGenerated)
        .map((field) => field.label),
      cta: {
        label: "تکمیل تنظیمات",
        href: `#action-${actionKey}-configuration`,
      },
    };
  }

  return {
    code: "ready",
    statusLabel: "آماده فعال‌سازی",
    message: "مجموعه‌ها و فیلدهای موردنیاز آماده‌اند.",
    missingFields: [],
    cta: null,
  };
};

export const isBusinessActionKey = (value: string): value is BusinessActionKey =>
  Object.hasOwn(BUSINESS_ACTION_CONFIGURATION_SPECS, value);
