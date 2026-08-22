export const BUSINESS_DATA_COLLECTION_KINDS = [
  "product",
  "service",
  "menu_item",
  "plan",
  "course",
  "order",
  "reservation",
  "delivery",
  "return",
  "discount",
  "branch",
  "enrollment",
  "schedule",
  "teacher",
  "room",
  "availability",
  "package",
  "subscription",
  "account_status",
  "usage_billing",
  "property",
  "custom",
] as const;

export type BusinessDataCollectionKind =
  (typeof BUSINESS_DATA_COLLECTION_KINDS)[number];

export const BUSINESS_DATA_ACCESS_SCOPES = [
  "public_catalog",
  "verified_customer",
  "internal",
] as const;

export type BusinessDataAccessScope =
  (typeof BUSINESS_DATA_ACCESS_SCOPES)[number];

export const BUSINESS_DATA_FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "currency",
  "boolean",
  "date",
  "datetime",
  "select",
  "url",
] as const;

export type BusinessDataFieldType =
  (typeof BUSINESS_DATA_FIELD_TYPES)[number];

export const BUSINESS_DATA_AI_EXPOSURES = [
  "answer",
  "filter_only",
  "hidden",
] as const;

export type BusinessDataAiExposure =
  (typeof BUSINESS_DATA_AI_EXPOSURES)[number];

/**
 * Source kinds describe adapters, not implementations. Only manual and CSV
 * are planned for the first management milestone; the rest reserve stable
 * domain values for later connectors.
 */
export const BUSINESS_DATA_SOURCE_TYPES = [
  "manual",
  "csv",
  "excel",
  "google_sheets",
  "supabase",
  "postgresql",
  "mysql",
  "mongodb",
  "api",
  "shopify",
  "woocommerce",
  "custom_connector",
] as const;

export type BusinessDataSourceType =
  (typeof BUSINESS_DATA_SOURCE_TYPES)[number];

export const BUSINESS_DATA_COLLECTION_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;

export type BusinessDataCollectionStatus =
  (typeof BUSINESS_DATA_COLLECTION_STATUSES)[number];

export const BUSINESS_DATA_SOURCE_STATUSES = [
  "pending",
  "ready",
  "syncing",
  "paused",
  "error",
  "disconnected",
] as const;

export type BusinessDataSourceStatus =
  (typeof BUSINESS_DATA_SOURCE_STATUSES)[number];

export const BUSINESS_DATA_SYNC_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
] as const;

export type BusinessDataSyncStatus =
  (typeof BUSINESS_DATA_SYNC_STATUSES)[number];

export const BUSINESS_DATA_RECORD_STATUSES = ["active", "archived"] as const;

export type BusinessDataRecordStatus =
  (typeof BUSINESS_DATA_RECORD_STATUSES)[number];

export const BUSINESS_DATA_FIELD_ROLES = [
  "title",
  "description",
  "category",
  "sku",
  "price",
  "currency",
  "availability",
  "status",
  "reference",
  "url",
  "quantity",
  "start_at",
  "end_at",
  "location",
  "customer_identifier",
  "phone",
  "email",
  "account_identifier",
  "channel_identifier",
  "tracking",
  "internal_notes",
  "custom",
] as const;

export type BusinessDataFieldRole =
  (typeof BUSINESS_DATA_FIELD_ROLES)[number];

export type BusinessDataScalar = string | number | boolean | null;
export type BusinessDataRecordValues = Record<string, BusinessDataScalar>;

export type BusinessDataFieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  decimalPlaces?: number;
  options?: string[];
};

export type BusinessDataFieldDefinition = {
  key: string;
  label: string;
  description?: string;
  type: BusinessDataFieldType;
  role: BusinessDataFieldRole;
  required: boolean;
  searchable: boolean;
  filterable: boolean;
  aiExposure: BusinessDataAiExposure;
  position: number;
  validation?: BusinessDataFieldValidation;
};

export type BusinessDataCollectionDefinition = {
  name: string;
  description: string;
  kind: BusinessDataCollectionKind;
  accessScope: BusinessDataAccessScope;
  status: BusinessDataCollectionStatus;
  aiEnabled: boolean;
  fields: BusinessDataFieldDefinition[];
};

export type BusinessDataTemplate = {
  id: string;
  label: string;
  description: string;
  kind: BusinessDataCollectionKind;
  accessScope: BusinessDataAccessScope;
  aiEnabled: boolean;
  fields: readonly BusinessDataFieldDefinition[];
};

export type BusinessDataValidationCode =
  | "invalid_type"
  | "invalid_value"
  | "required"
  | "unknown_field"
  | "duplicate_field"
  | "limit_exceeded"
  | "too_large";

export type BusinessDataValidationIssue = {
  code: BusinessDataValidationCode;
  path: string;
  message: string;
};

export type BusinessDataValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: BusinessDataValidationIssue[] };

const includesValue = <T extends string>(
  values: readonly T[],
  value: unknown
): value is T => typeof value === "string" && values.includes(value as T);

export const isBusinessDataCollectionKind = (
  value: unknown
): value is BusinessDataCollectionKind =>
  includesValue(BUSINESS_DATA_COLLECTION_KINDS, value);

export const isBusinessDataAccessScope = (
  value: unknown
): value is BusinessDataAccessScope =>
  includesValue(BUSINESS_DATA_ACCESS_SCOPES, value);

export const isBusinessDataFieldType = (
  value: unknown
): value is BusinessDataFieldType =>
  includesValue(BUSINESS_DATA_FIELD_TYPES, value);

export const isBusinessDataAiExposure = (
  value: unknown
): value is BusinessDataAiExposure =>
  includesValue(BUSINESS_DATA_AI_EXPOSURES, value);

export const isBusinessDataSourceType = (
  value: unknown
): value is BusinessDataSourceType =>
  includesValue(BUSINESS_DATA_SOURCE_TYPES, value);

export const isBusinessDataCollectionStatus = (
  value: unknown
): value is BusinessDataCollectionStatus =>
  includesValue(BUSINESS_DATA_COLLECTION_STATUSES, value);

export const isBusinessDataSourceStatus = (
  value: unknown
): value is BusinessDataSourceStatus =>
  includesValue(BUSINESS_DATA_SOURCE_STATUSES, value);

export const isBusinessDataSyncStatus = (
  value: unknown
): value is BusinessDataSyncStatus =>
  includesValue(BUSINESS_DATA_SYNC_STATUSES, value);

export const isBusinessDataRecordStatus = (
  value: unknown
): value is BusinessDataRecordStatus =>
  includesValue(BUSINESS_DATA_RECORD_STATUSES, value);

export const isBusinessDataFieldRole = (
  value: unknown
): value is BusinessDataFieldRole =>
  includesValue(BUSINESS_DATA_FIELD_ROLES, value);

export const isPublicAiCollection = (
  collection: Pick<
    BusinessDataCollectionDefinition,
    "accessScope" | "aiEnabled" | "status"
  >
) =>
  collection.accessScope === "public_catalog" &&
  collection.aiEnabled &&
  collection.status === "active";

export const isCustomerVerifiedAiCollection = (
  collection: Pick<
    BusinessDataCollectionDefinition,
    "accessScope" | "aiEnabled" | "status"
  >
) =>
  collection.accessScope === "verified_customer" &&
  collection.aiEnabled &&
  collection.status === "active";
