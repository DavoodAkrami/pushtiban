import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  BusinessDataCollection,
  BusinessDataCollectionDetail,
  BusinessDataField,
  BusinessDataRecord,
  BusinessDataRecordPage,
  BusinessDataSource,
  BusinessDataSyncRun,
  BusinessDataPrivateAccessConfig,
} from "./api-types";
import { BUSINESS_DATA_LIMITS } from "./limits";
import type {
  BusinessDataCollectionDefinition,
  BusinessDataCollectionStatus,
  BusinessDataFieldDefinition,
  BusinessDataRecordStatus,
} from "./types";
import {
  isBusinessDataRecordStatus,
  isBusinessDataCollectionStatus,
} from "./types";
import {
  normalizeExternalId,
  validateCollectionDefinition,
  validateFieldDefinitions,
  validateRecordValues,
} from "./validation";
import type {
  IngestionMapping,
  IngestionPreview,
  IngestionSourceType,
} from "./ingestion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { invalidateBusinessDataAiCapabilities } from "./ai-retrieval";
import {
  appendImportFieldPositions,
  findConflictingProposedImportFields,
  selectProposedImportFields,
} from "./import-plan";

type CollectionRow = {
  id: string;
  user_id: string;
  key: string;
  name: string;
  description: string;
  kind: BusinessDataCollection["kind"];
  access_scope: BusinessDataCollection["accessScope"];
  ai_enabled: boolean;
  status: BusinessDataCollectionStatus;
  schema_version: number;
  created_at: string;
  updated_at: string;
};

type FieldRow = {
  id: string;
  key: string;
  label: string;
  description: string;
  data_type: BusinessDataField["type"];
  semantic_role: BusinessDataField["role"];
  required: boolean;
  searchable: boolean;
  filterable: boolean;
  ai_exposure: BusinessDataField["aiExposure"];
  position: number;
  validation: BusinessDataField["validation"] | null;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  id: string;
  name: string;
  source_type: BusinessDataSource["type"];
  status: BusinessDataSource["status"];
  last_attempted_at: string | null;
  last_succeeded_at: string | null;
  last_error: string | null;
  configuration: Record<string, unknown>;
  field_mapping: Record<string, string | null>;
  created_at: string;
  updated_at: string;
};

type RecordRow = {
  id: string;
  values: BusinessDataRecord["values"];
  status: BusinessDataRecordStatus;
  source_id: string | null;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

type SyncRunRow = {
  id: string;
  source_id: string;
  status: BusinessDataSyncRun["status"];
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  error_summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type PrivateAccessConfigRow = {
  enabled: boolean;
  locator_field_id: string;
  verification_field_id: string;
  updated_at: string;
};

const COLLECTION_COLUMNS =
  "id, user_id, key, name, description, kind, access_scope, ai_enabled, status, schema_version, created_at, updated_at";
const FIELD_COLUMNS =
  "id, key, label, description, data_type, semantic_role, required, searchable, filterable, ai_exposure, position, validation, created_at, updated_at";
const SOURCE_COLUMNS =
  "id, name, source_type, status, configuration, field_mapping, last_attempted_at, last_succeeded_at, last_error, created_at, updated_at";
const RECORD_COLUMNS =
  "id, values, status, source_id, source_updated_at, created_at, updated_at";
const SYNC_RUN_COLUMNS =
  "id, source_id, status, inserted_count, updated_count, skipped_count, failed_count, error_summary, started_at, completed_at, created_at";

export class BusinessDataServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "invalid_request") {
    super(message);
    this.name = "BusinessDataServiceError";
    this.status = status;
    this.code = code;
  }
}

export type BusinessDataContext = {
  admin: SupabaseClient;
  user: User;
};

export const getBusinessDataContext = async (): Promise<BusinessDataContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new BusinessDataServiceError(
      "نشست شما تمام شده؛ دوباره وارد شوید.",
      401,
      "unauthorized"
    );
  }
  return { admin: createAdminClient(), user };
};

const mapField = (row: FieldRow): BusinessDataField => ({
  id: row.id,
  key: row.key,
  label: row.label,
  ...(row.description ? { description: row.description } : {}),
  type: row.data_type,
  role: row.semantic_role,
  required: row.required,
  searchable: row.searchable,
  filterable: row.filterable,
  aiExposure: row.ai_exposure,
  position: row.position,
  ...(row.validation && Object.keys(row.validation).length
    ? { validation: row.validation }
    : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSource = (row: SourceRow): BusinessDataSource => ({
  id: row.id,
  name: row.name,
  type: row.source_type,
  status: row.status,
  lastAttemptedAt: row.last_attempted_at,
  lastSucceededAt: row.last_succeeded_at,
  lastError: row.last_error,
  configuration: row.configuration ?? {},
  fieldMapping: row.field_mapping ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRecord = (row: RecordRow): BusinessDataRecord => ({
  id: row.id,
  values: row.values,
  status: row.status,
  sourceId: row.source_id,
  sourceUpdatedAt: row.source_updated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSyncRun = (row: SyncRunRow): BusinessDataSyncRun => ({
  id: row.id,
  sourceId: row.source_id,
  status: row.status,
  insertedCount: row.inserted_count,
  updatedCount: row.updated_count,
  skippedCount: row.skipped_count,
  failedCount: row.failed_count,
  errorSummary: row.error_summary,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  createdAt: row.created_at,
});

const mapPrivateAccessConfig = (
  row: PrivateAccessConfigRow | null
): BusinessDataPrivateAccessConfig | null =>
  row
    ? {
        enabled: row.enabled,
        locatorFieldId: row.locator_field_id,
        verificationFieldId: row.verification_field_id,
        updatedAt: row.updated_at,
      }
    : null;

const invalidDefinition = (issues: { path: string }[]) => {
  const first = issues[0]?.path ?? "collection";
  const messages: Record<string, string> = {
    name: "نام مجموعه را کامل و کوتاه وارد کنید.",
    fields: "ساختار مجموعه باید دقیقاً یک فیلد عنوان داشته باشد.",
    aiEnabled: "دسترسی دستیار فقط برای داده‌های عمومی قابل فعال‌سازی است.",
  };
  const root = first.split(".")[0];
  return new BusinessDataServiceError(
    messages[root] ?? "اطلاعات مجموعه معتبر نیست.",
    400,
    "validation_failed"
  );
};

const mapDatabaseFailure = (error: { code?: string; message?: string } | null) => {
  const message = error?.message ?? "";
  if (error?.code === "23505") {
    if (message.includes("business_data_fields_collection_id_position_key")) {
      return new BusinessDataServiceError(
        "جایگاه یکی از فیلدهای جدید با ساختار مجموعه تداخل داشت؛ دوباره تلاش کنید.",
        409,
        "field_position_conflict"
      );
    }
    if (message.includes("business_data_fields_collection_id_key_key")) {
      return new BusinessDataServiceError(
        "یکی از فیلدهای پیشنهادی از قبل در مجموعه وجود دارد.",
        409,
        "field_duplicate"
      );
    }
    if (message.includes("business_data_records_external_id_unique")) {
      return new BusinessDataServiceError(
        "شناسه یکتای یکی از رکوردها با داده موجود تداخل دارد.",
        409,
        "record_identity_conflict"
      );
    }
    return new BusinessDataServiceError(
      "این مقدار قبلاً در مجموعه استفاده شده است.",
      409,
      "duplicate"
    );
  }
  if (error?.code === "23514" || error?.code === "23502") {
    if (message.includes("limit exceeded")) {
      return new BusinessDataServiceError(
        "ظرفیت این بخش تکمیل شده است.",
        409,
        "limit_exceeded"
      );
    }
    if (message.includes("while records exist")) {
      return new BusinessDataServiceError(
        "تا وقتی این مجموعه رکورد دارد، این تغییر ساختاری ممکن نیست.",
        409,
        "records_exist"
      );
    }
    return new BusinessDataServiceError(
      "اطلاعات با ساختار این مجموعه سازگار نیست.",
      400,
      "validation_failed"
    );
  }
  return new BusinessDataServiceError(
    "ذخیره اطلاعات انجام نشد؛ دوباره تلاش کنید.",
    500,
    "database_error"
  );
};

const getCollectionRow = async (
  context: BusinessDataContext,
  collectionId: string
): Promise<CollectionRow> => {
  const { data, error } = await context.admin
    .from("business_data_collections")
    .select(COLLECTION_COLUMNS)
    .eq("id", collectionId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error) throw mapDatabaseFailure(error);
  if (!data) {
    throw new BusinessDataServiceError(
      "مجموعه پیدا نشد.",
      404,
      "not_found"
    );
  }
  return data as CollectionRow;
};

const assertCollectionWritable = (collection: CollectionRow) => {
  if (collection.status === "archived") {
    throw new BusinessDataServiceError(
      "این مجموعه بایگانی شده است؛ ابتدا آن را دوباره فعال کنید.",
      409,
      "collection_archived"
    );
  }
};

const getFieldRows = async (
  context: BusinessDataContext,
  collectionId: string
): Promise<FieldRow[]> => {
  const { data, error } = await context.admin
    .from("business_data_fields")
    .select(FIELD_COLUMNS)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .order("position", { ascending: true });
  if (error) throw mapDatabaseFailure(error);
  return (data ?? []) as FieldRow[];
};

const getSourceRows = async (
  context: BusinessDataContext,
  collectionId: string
): Promise<SourceRow[]> => {
  const { data, error } = await context.admin
    .from("business_data_sources")
    .select(SOURCE_COLUMNS)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: true });
  if (error) throw mapDatabaseFailure(error);
  return (data ?? []) as SourceRow[];
};

const getPrimarySource = (sources: SourceRow[]) =>
  sources.find((source) => source.source_type === "supabase") ??
  sources.find((source) => source.source_type !== "manual") ??
  sources[0] ??
  null;

const getRecordCounts = async (
  context: BusinessDataContext,
  collectionId: string
) => {
  const [
    { count: total, error: totalError },
    { count: active, error: activeError },
    { data: latestRecord, error: latestRecordError },
  ] = await Promise.all([
      context.admin
        .from("business_data_records")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", collectionId)
        .eq("user_id", context.user.id),
      context.admin
        .from("business_data_records")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", collectionId)
        .eq("user_id", context.user.id)
        .eq("status", "active"),
      context.admin
        .from("business_data_records")
        .select("updated_at")
        .eq("collection_id", collectionId)
        .eq("user_id", context.user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (totalError || activeError || latestRecordError) {
    throw mapDatabaseFailure(totalError ?? activeError ?? latestRecordError);
  }
  return {
    total: total ?? 0,
    active: active ?? 0,
    latestUpdatedAt:
      latestRecord && typeof latestRecord.updated_at === "string"
        ? latestRecord.updated_at
        : null,
  };
};

const getSyncRuns = async (
  context: BusinessDataContext,
  collectionId: string
): Promise<BusinessDataSyncRun[]> => {
  const { data, error } = await context.admin
    .from("business_data_sync_runs")
    .select(SYNC_RUN_COLUMNS)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw mapDatabaseFailure(error);
  return ((data ?? []) as SyncRunRow[]).map(mapSyncRun);
};

const getPrivateAccessConfigRow = async (
  context: BusinessDataContext,
  collectionId: string
): Promise<PrivateAccessConfigRow | null> => {
  const { data, error } = await context.admin
    .from("business_data_private_access_configs")
    .select("enabled, locator_field_id, verification_field_id, updated_at")
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error) throw mapDatabaseFailure(error);
  return (data as PrivateAccessConfigRow | null) ?? null;
};

const collectionDefinitionFromRows = (
  collection: CollectionRow,
  fields: FieldRow[]
): BusinessDataCollectionDefinition => ({
  name: collection.name,
  description: collection.description,
  kind: collection.kind,
  accessScope: collection.access_scope,
  status: collection.status,
  aiEnabled: collection.ai_enabled,
  fields: fields.map(mapField),
});

const toFieldInsert = (
  userId: string,
  collectionId: string,
  field: BusinessDataFieldDefinition
) => ({
  user_id: userId,
  collection_id: collectionId,
  key: field.key,
  label: field.label,
  description: field.description ?? "",
  data_type: field.type,
  semantic_role: field.role,
  required: field.required,
  searchable: field.searchable,
  filterable: field.filterable,
  ai_exposure: field.aiExposure,
  position: field.position,
  validation: field.validation ?? {},
});

export const getCollectionDetail = async (
  context: BusinessDataContext,
  collectionId: string
): Promise<BusinessDataCollectionDetail> => {
  const collection = await getCollectionRow(context, collectionId);
  const [fields, sources, counts, syncRuns, privateAccess] = await Promise.all([
    getFieldRows(context, collectionId),
    getSourceRows(context, collectionId),
    getRecordCounts(context, collectionId),
    getSyncRuns(context, collectionId),
    getPrivateAccessConfigRow(context, collectionId),
  ]);
  return {
    id: collection.id,
    key: collection.key,
    name: collection.name,
    description: collection.description,
    kind: collection.kind,
    accessScope: collection.access_scope,
    aiEnabled: collection.ai_enabled,
    status: collection.status,
    schemaVersion: collection.schema_version,
    recordCount: counts.total,
    activeRecordCount: counts.active,
    dataUpdatedAt: counts.latestUpdatedAt,
    source: getPrimarySource(sources) ? mapSource(getPrimarySource(sources)!) : null,
    fields: fields.map(mapField),
    syncRuns,
    privateAccess: mapPrivateAccessConfig(privateAccess),
    createdAt: collection.created_at,
    updatedAt: collection.updated_at,
  };
};

export const listCollections = async (
  context: BusinessDataContext
): Promise<BusinessDataCollection[]> => {
  const { data, error } = await context.admin
    .from("business_data_collections")
    .select(COLLECTION_COLUMNS)
    .eq("user_id", context.user.id)
    .order("updated_at", { ascending: false });
  if (error) throw mapDatabaseFailure(error);
  return Promise.all(
    ((data ?? []) as CollectionRow[]).map(async (collection) => {
      const [sources, counts] = await Promise.all([
        getSourceRows(context, collection.id),
        getRecordCounts(context, collection.id),
      ]);
      return {
        id: collection.id,
        key: collection.key,
        name: collection.name,
        description: collection.description,
        kind: collection.kind,
        accessScope: collection.access_scope,
        aiEnabled: collection.ai_enabled,
        status: collection.status,
        schemaVersion: collection.schema_version,
        recordCount: counts.total,
        activeRecordCount: counts.active,
        dataUpdatedAt: counts.latestUpdatedAt,
        source: getPrimarySource(sources) ? mapSource(getPrimarySource(sources)!) : null,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at,
      };
    })
  );
};

export const createCollection = async (
  context: BusinessDataContext,
  input: unknown
): Promise<BusinessDataCollectionDetail> => {
  const result = validateCollectionDefinition(input);
  if (!result.ok) throw invalidDefinition(result.issues);
  const definition = result.value;
  if (definition.accessScope === "verified_customer" && definition.aiEnabled) {
    throw new BusinessDataServiceError(
      "دسترسی دستیار به داده خصوصی را پس از تعیین دو فیلد تأیید فعال کنید.",
      400,
      "private_access_configuration_required"
    );
  }

  const { count, error: countError } = await context.admin
    .from("business_data_collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id);
  if (countError) throw mapDatabaseFailure(countError);
  if ((count ?? 0) >= BUSINESS_DATA_LIMITS.collectionsPerUser) {
    throw new BusinessDataServiceError(
      "حداکثر تعداد مجموعه‌های این حساب ساخته شده است.",
      409,
      "limit_exceeded"
    );
  }

  const collectionKey = `${definition.kind}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const { data: collectionId, error: collectionError } = await context.admin.rpc(
    "business_data_create_manual_collection",
    {
      p_user_id: context.user.id,
      p_key: collectionKey,
      p_name: definition.name,
      p_description: definition.description,
      p_kind: definition.kind,
      p_access_scope: definition.accessScope,
      p_ai_enabled: definition.aiEnabled,
      p_status: definition.status,
      p_fields: definition.fields.map((field) => ({
        key: field.key,
        label: field.label,
        description: field.description ?? "",
        data_type: field.type,
        semantic_role: field.role,
        required: field.required,
        searchable: field.searchable,
        filterable: field.filterable,
        ai_exposure: field.aiExposure,
        position: field.position,
        validation: field.validation ?? {},
      })),
    }
  );
  if (collectionError || typeof collectionId !== "string") {
    throw mapDatabaseFailure(collectionError);
  }
  invalidateBusinessDataAiCapabilities(context.user.id);
  return getCollectionDetail(context, collectionId);
};

export const updateCollection = async (
  context: BusinessDataContext,
  collectionId: string,
  input: unknown
): Promise<BusinessDataCollectionDetail> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BusinessDataServiceError("اطلاعات قابل خواندن نیست.");
  }
  const body = input as Record<string, unknown>;
  const collection = await getCollectionRow(context, collectionId);
  const fields = await getFieldRows(context, collectionId);
  const status = body.status ?? collection.status;
  if (!isBusinessDataCollectionStatus(status)) {
    throw new BusinessDataServiceError("وضعیت مجموعه معتبر نیست.");
  }
  const candidate = {
    ...collectionDefinitionFromRows(collection, fields),
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.accessScope !== undefined ? { accessScope: body.accessScope } : {}),
    ...(body.aiEnabled !== undefined ? { aiEnabled: body.aiEnabled } : {}),
    status,
  };
  if (status === "archived") candidate.aiEnabled = false;
  const result = validateCollectionDefinition(candidate);
  if (!result.ok) throw invalidDefinition(result.issues);
  if (
    result.value.accessScope === "verified_customer" &&
    result.value.aiEnabled &&
    !collection.ai_enabled
  ) {
    throw new BusinessDataServiceError(
      "دسترسی دستیار به داده خصوصی فقط از بخش تأیید مشتری فعال می‌شود.",
      400,
      "private_access_configuration_required"
    );
  }

  const { error } = await context.admin
    .from("business_data_collections")
    .update({
      name: result.value.name,
      description: result.value.description,
      access_scope: result.value.accessScope,
      ai_enabled: result.value.aiEnabled,
      status: result.value.status,
    })
    .eq("id", collectionId)
    .eq("user_id", context.user.id);
  if (error) throw mapDatabaseFailure(error);
  invalidateBusinessDataAiCapabilities(context.user.id);
  return getCollectionDetail(context, collectionId);
};

export const updatePrivateAccessConfig = async (
  context: BusinessDataContext,
  collectionId: string,
  input: unknown
): Promise<BusinessDataCollectionDetail> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BusinessDataServiceError("اطلاعات قابل خواندن نیست.");
  }
  const body = input as Record<string, unknown>;
  if (
    typeof body.enabled !== "boolean" ||
    typeof body.locatorFieldId !== "string" ||
    typeof body.verificationFieldId !== "string"
  ) {
    throw new BusinessDataServiceError("تنظیمات تأیید مشتری کامل نیست.");
  }
  const collection = await getCollectionRow(context, collectionId);
  if (collection.access_scope !== "verified_customer") {
    throw new BusinessDataServiceError(
      "تنظیم تأیید فقط برای مجموعه‌های مشتری تأییدشده است.",
      400,
      "invalid_access_scope"
    );
  }
  const fields = await getFieldRows(context, collectionId);
  const locator = fields.find((field) => field.id === body.locatorFieldId);
  const verifier = fields.find(
    (field) => field.id === body.verificationFieldId
  );
  const isVerificationField = (field: FieldRow | undefined) =>
    Boolean(
      field &&
        field.required &&
        field.filterable &&
        field.ai_exposure === "filter_only"
    );
  if (
    !isVerificationField(locator) ||
    !isVerificationField(verifier) ||
    !locator ||
    !verifier ||
    locator.id === verifier.id
  ) {
    throw new BusinessDataServiceError(
      "هر دو فیلد تأیید باید متفاوت، الزامی، قابل جست‌وجو و فقط برای پیدا کردن رکورد باشند.",
      400,
      "invalid_private_access_fields"
    );
  }

  const { error: configError } = await context.admin
    .from("business_data_private_access_configs")
    .upsert(
      {
        collection_id: collectionId,
        user_id: context.user.id,
        locator_field_id: locator.id,
        verification_field_id: verifier.id,
        enabled: body.enabled,
      },
      { onConflict: "collection_id" }
    );
  if (configError) throw mapDatabaseFailure(configError);

  const { error: collectionError } = await context.admin
    .from("business_data_collections")
    .update({ ai_enabled: body.enabled && collection.status === "active" })
    .eq("id", collectionId)
    .eq("user_id", context.user.id);
  if (collectionError) throw mapDatabaseFailure(collectionError);
  invalidateBusinessDataAiCapabilities(context.user.id);
  return getCollectionDetail(context, collectionId);
};

export const deleteCollection = async (
  context: BusinessDataContext,
  collectionId: string,
  confirmation: unknown
) => {
  const collection = await getCollectionRow(context, collectionId);
  if (typeof confirmation !== "string" || confirmation.trim() !== collection.name) {
    throw new BusinessDataServiceError(
      "برای حذف کامل، نام مجموعه را دقیق وارد کنید.",
      400,
      "confirmation_required"
    );
  }
  const { error } = await context.admin.rpc("business_data_delete_collection", {
    p_user_id: context.user.id,
    p_collection_id: collectionId,
  });
  if (error) throw mapDatabaseFailure(error);
  invalidateBusinessDataAiCapabilities(context.user.id);
};

export const createField = async (
  context: BusinessDataContext,
  collectionId: string,
  input: unknown
): Promise<BusinessDataCollectionDetail> => {
  const collection = await getCollectionRow(context, collectionId);
  assertCollectionWritable(collection);
  const fields = await getFieldRows(context, collectionId);
  const result = validateFieldDefinitions([
    ...fields.map(mapField),
    { ...(input as object), position: fields.length },
  ]);
  if (!result.ok) throw invalidDefinition(result.issues);
  const field = {
    ...result.value.at(-1)!,
    position:
      fields.length === 0
        ? 0
        : Math.max(...fields.map((existing) => existing.position)) + 1,
  };
  const { error } = await context.admin
    .from("business_data_fields")
    .insert(toFieldInsert(context.user.id, collectionId, field));
  if (error) throw mapDatabaseFailure(error);
  invalidateBusinessDataAiCapabilities(context.user.id);
  return getCollectionDetail(context, collectionId);
};

export const updateField = async (
  context: BusinessDataContext,
  collectionId: string,
  fieldId: string,
  input: unknown
): Promise<BusinessDataCollectionDetail> => {
  const collection = await getCollectionRow(context, collectionId);
  assertCollectionWritable(collection);
  const fields = await getFieldRows(context, collectionId);
  const index = fields.findIndex((field) => field.id === fieldId);
  if (index < 0) {
    throw new BusinessDataServiceError("فیلد پیدا نشد.", 404, "not_found");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BusinessDataServiceError("اطلاعات قابل خواندن نیست.");
  }
  const current = mapField(fields[index]);
  const next = {
    ...current,
    ...(input as Record<string, unknown>),
    key: current.key,
    role: current.role,
    position: index,
  };
  const candidates = fields.map((field, position) =>
    position === index ? next : { ...mapField(field), position }
  );
  const result = validateFieldDefinitions(candidates);
  if (!result.ok) throw invalidDefinition(result.issues);
  const field = result.value[index];
  const { error } = await context.admin
    .from("business_data_fields")
    .update({
      label: field.label,
      description: field.description ?? "",
      data_type: field.type,
      semantic_role: field.role,
      required: field.required,
      searchable: field.searchable,
      filterable: field.filterable,
      ai_exposure: field.aiExposure,
      validation: field.validation ?? {},
    })
    .eq("id", fieldId)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id);
  if (error) throw mapDatabaseFailure(error);
  invalidateBusinessDataAiCapabilities(context.user.id);
  return getCollectionDetail(context, collectionId);
};

export const moveField = async (
  context: BusinessDataContext,
  collectionId: string,
  fieldId: string,
  direction: -1 | 1
): Promise<BusinessDataCollectionDetail> => {
  const collection = await getCollectionRow(context, collectionId);
  assertCollectionWritable(collection);
  const fields = await getFieldRows(context, collectionId);
  const index = fields.findIndex((field) => field.id === fieldId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= fields.length) {
    throw new BusinessDataServiceError("جابه‌جایی فیلد ممکن نیست.", 400);
  }
  const { error } = await context.admin.rpc("business_data_move_field", {
    p_user_id: context.user.id,
    p_collection_id: collectionId,
    p_field_id: fieldId,
    p_direction: direction,
  });
  if (error) throw mapDatabaseFailure(error);
  invalidateBusinessDataAiCapabilities(context.user.id);
  return getCollectionDetail(context, collectionId);
};

export const deleteField = async (
  context: BusinessDataContext,
  collectionId: string,
  fieldId: string
): Promise<BusinessDataCollectionDetail> => {
  const collection = await getCollectionRow(context, collectionId);
  assertCollectionWritable(collection);
  const fields = await getFieldRows(context, collectionId);
  const index = fields.findIndex((field) => field.id === fieldId);
  if (index < 0) {
    throw new BusinessDataServiceError("فیلد پیدا نشد.", 404, "not_found");
  }
  const remaining = fields.filter((field) => field.id !== fieldId).map(mapField);
  const result = validateFieldDefinitions(remaining);
  if (!result.ok) throw invalidDefinition(result.issues);
  const { error } = await context.admin
    .from("business_data_fields")
    .delete()
    .eq("id", fieldId)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id);
  if (error) throw mapDatabaseFailure(error);
  invalidateBusinessDataAiCapabilities(context.user.id);
  return getCollectionDetail(context, collectionId);
};

export const listRecords = async (
  context: BusinessDataContext,
  collectionId: string,
  options: {
    page: number;
    pageSize: number;
    query: string;
    status: "all" | BusinessDataRecordStatus;
    sort: "updated_desc" | "updated_asc" | "created_desc";
  }
): Promise<BusinessDataRecordPage> => {
  await getCollectionRow(context, collectionId);
  const requestedPage = Number.isFinite(options.page) ? options.page : 1;
  const requestedPageSize = Number.isFinite(options.pageSize)
    ? options.pageSize
    : 20;
  const page = Math.max(1, Math.floor(requestedPage));
  const pageSize = Math.min(50, Math.max(1, Math.floor(requestedPageSize)));
  const start = (page - 1) * pageSize;
  let query = context.admin
    .from("business_data_records")
    .select(RECORD_COLUMNS, { count: "exact" })
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id);
  if (options.status !== "all") query = query.eq("status", options.status);
  const search = options.query.trim().slice(0, 120);
  if (search) query = query.ilike("search_text", `%${search}%`);
  if (options.sort === "updated_asc") {
    query = query.order("updated_at", { ascending: true });
  } else if (options.sort === "created_desc") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw mapDatabaseFailure(error);
  const total = count ?? 0;
  return {
    records: ((data ?? []) as RecordRow[]).map(mapRecord),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const getRecordRow = async (
  context: BusinessDataContext,
  collectionId: string,
  recordId: string
): Promise<RecordRow> => {
  await getCollectionRow(context, collectionId);
  const { data, error } = await context.admin
    .from("business_data_records")
    .select(RECORD_COLUMNS)
    .eq("id", recordId)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error) throw mapDatabaseFailure(error);
  if (!data) throw new BusinessDataServiceError("رکورد پیدا نشد.", 404, "not_found");
  return data as RecordRow;
};

export const getRecord = async (
  context: BusinessDataContext,
  collectionId: string,
  recordId: string
) => mapRecord(await getRecordRow(context, collectionId, recordId));

export const createRecord = async (
  context: BusinessDataContext,
  collectionId: string,
  input: unknown
): Promise<BusinessDataRecord> => {
  const collection = await getCollectionRow(context, collectionId);
  assertCollectionWritable(collection);
  const fields = (await getFieldRows(context, collectionId)).map(mapField);
  const values =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).values
      : undefined;
  const result = validateRecordValues(values, fields);
  if (!result.ok) {
    throw new BusinessDataServiceError(
      "مقادیر رکورد را بررسی کنید؛ بعضی فیلدها کامل یا معتبر نیستند.",
      400,
      "validation_failed"
    );
  }
  const { count, error: countError } = await context.admin
    .from("business_data_records")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id)
    .eq("status", "active");
  if (countError) throw mapDatabaseFailure(countError);
  if ((count ?? 0) >= BUSINESS_DATA_LIMITS.recordsPerUser) {
    throw new BusinessDataServiceError(
      "ظرفیت رکوردهای فعال این حساب تکمیل شده است.",
      409,
      "limit_exceeded"
    );
  }
  const sources = await getSourceRows(context, collectionId);
  const manualSource = sources.find((source) => source.source_type === "manual");
  if (!manualSource) {
    throw new BusinessDataServiceError(
      "منبع دستی این مجموعه آماده نیست.",
      409,
      "source_unavailable"
    );
  }
  const externalIdRaw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).externalId
      : undefined;
  const externalId =
    typeof externalIdRaw === "string" && externalIdRaw.trim()
      ? normalizeExternalId(externalIdRaw).slice(0, BUSINESS_DATA_LIMITS.externalIdChars)
      : null;
  const { data, error } = await context.admin
    .from("business_data_records")
    .insert({
      user_id: context.user.id,
      collection_id: collectionId,
      source_id: manualSource.id,
      external_id: externalId,
      values: result.value,
      status: "active",
    })
    .select(RECORD_COLUMNS)
    .single();
  if (error || !data) throw mapDatabaseFailure(error);
  return mapRecord(data as RecordRow);
};

export const updateRecord = async (
  context: BusinessDataContext,
  collectionId: string,
  recordId: string,
  input: unknown
): Promise<BusinessDataRecord> => {
  const collection = await getCollectionRow(context, collectionId);
  assertCollectionWritable(collection);
  const current = await getRecordRow(context, collectionId, recordId);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BusinessDataServiceError("اطلاعات قابل خواندن نیست.");
  }
  const body = input as Record<string, unknown>;
  const status = body.status ?? current.status;
  if (!isBusinessDataRecordStatus(status)) {
    throw new BusinessDataServiceError("وضعیت رکورد معتبر نیست.");
  }
  const fields = (await getFieldRows(context, collectionId)).map(mapField);
  const result = validateRecordValues(body.values ?? current.values, fields);
  if (!result.ok) {
    throw new BusinessDataServiceError(
      "مقادیر رکورد را بررسی کنید؛ بعضی فیلدها کامل یا معتبر نیستند.",
      400,
      "validation_failed"
    );
  }
  const { data, error } = await context.admin
    .from("business_data_records")
    .update({ values: result.value, status })
    .eq("id", recordId)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .select(RECORD_COLUMNS)
    .single();
  if (error || !data) throw mapDatabaseFailure(error);
  return mapRecord(data as RecordRow);
};

export const deleteRecord = async (
  context: BusinessDataContext,
  collectionId: string,
  recordId: string
) => {
  await getRecordRow(context, collectionId, recordId);
  const { error } = await context.admin
    .from("business_data_records")
    .delete()
    .eq("id", recordId)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id);
  if (error) throw mapDatabaseFailure(error);
};

const parseIngestionMapping = (value: unknown): IngestionMapping => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BusinessDataServiceError("تطبیق ستون‌ها قابل خواندن نیست.", 400, "invalid_mapping");
  }
  const mapping: IngestionMapping = {};
  for (const [key, target] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || (target !== null && typeof target !== "string")) {
      throw new BusinessDataServiceError("تطبیق ستون‌ها معتبر نیست.", 400, "invalid_mapping");
    }
    mapping[key] = target;
  }
  return mapping;
};

const parseProposedImportFields = (value: unknown): BusinessDataFieldDefinition[] => {
  if (value === undefined || value === null) return [];
  const result = validateFieldDefinitions(value, { requireTitle: false });
  if (!result.ok) throw invalidDefinition(result.issues);
  return result.value;
};

const idempotencyUuid = (scope: string, key: string) => {
  const hash = createHash("sha256").update(`${scope}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

export const previewIngestion = async (
  context: BusinessDataContext,
  input: {
    collectionId: string;
    preview: IngestionPreview;
    mapping: unknown;
    externalIdField: unknown;
  }
) => {
  const { buildImportPreview } = await import("./ingestion");
  const collection = await getCollectionRow(context, input.collectionId);
  const fields = (await getFieldRows(context, collection.id)).map(mapField);
  const mapping = parseIngestionMapping(input.mapping);
  const externalIdField = typeof input.externalIdField === "string" ? input.externalIdField : null;
  return buildImportPreview(input.preview, fields, mapping, externalIdField);
};

export const importIngestion = async (
  context: BusinessDataContext,
  input: {
    collectionId: string;
    preview: IngestionPreview;
    mapping: unknown;
    newFields: unknown;
    externalIdField: unknown;
    idempotencyKey: unknown;
  }
) => {
  const { mapAndValidateRows } = await import("./ingestion");
  const collection = await getCollectionRow(context, input.collectionId);
  assertCollectionWritable(collection);
  const fields = (await getFieldRows(context, collection.id)).map(mapField);
  const submittedProposedFields = parseProposedImportFields(input.newFields);
  const existingDefinitions: BusinessDataFieldDefinition[] = fields.map((field) => ({
    key: field.key,
    label: field.label,
    ...(field.description ? { description: field.description } : {}),
    type: field.type,
    role: field.role,
    required: field.required,
    searchable: field.searchable,
    filterable: field.filterable,
    aiExposure: field.aiExposure,
    position: field.position,
    ...(field.validation ? { validation: field.validation } : {}),
  }));
  const mapping = parseIngestionMapping(input.mapping);
  if (findConflictingProposedImportFields(submittedProposedFields, mapping, existingDefinitions).length > 0) {
    throw new BusinessDataServiceError(
      "یکی از فیلدهای پیشنهادی از قبل در مجموعه وجود دارد.",
      409,
      "field_duplicate"
    );
  }
  const proposedFields = appendImportFieldPositions(
    existingDefinitions,
    selectProposedImportFields(submittedProposedFields, mapping, existingDefinitions)
  );
  const allFieldsResult = validateFieldDefinitions([...existingDefinitions, ...proposedFields]);
  if (!allFieldsResult.ok) throw invalidDefinition(allFieldsResult.issues);
  const importFields = allFieldsResult.value;
  const externalIdField = typeof input.externalIdField === "string" ? input.externalIdField : null;
  const idempotencyKey = typeof input.idempotencyKey === "string"
    ? input.idempotencyKey.trim()
    : "";
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(idempotencyKey)) {
    throw new BusinessDataServiceError("درخواست ورود داده معتبر نیست؛ دوباره تلاش کنید.", 400, "invalid_idempotency");
  }
  const outcome = mapAndValidateRows(input.preview, mapping, importFields, externalIdField);
  if (!outcome.valid.length) {
    throw new BusinessDataServiceError("هیچ ردیف معتبری برای ورود پیدا نشد.", 400, "no_valid_rows");
  }
  const sourceType = input.preview.sourceType as IngestionSourceType;
  const sources = await getSourceRows(context, collection.id);
  const matchingSource = sources.find((source) => source.source_type === sourceType);
  const sourceId = matchingSource?.id ?? randomUUID();
  const { data, error } = await context.admin.rpc("business_data_import_records_with_fields", {
    p_user_id: context.user.id,
    p_collection_id: collection.id,
    p_source_id: sourceId,
    p_source_type: sourceType,
    p_source_name: input.preview.sourceName.slice(0, BUSINESS_DATA_LIMITS.sourceNameChars),
    p_source_configuration: {
      ...(sourceType === "supabase" && matchingSource?.configuration
        ? matchingSource.configuration
        : {}),
      sheetName: input.preview.sheetName,
      importedFrom:
        sourceType === "google_sheets"
          ? "google_sheets"
          : sourceType === "supabase"
            ? "supabase"
            : "file",
      ...(sourceType === "supabase" ? { externalIdField } : {}),
    },
    p_field_mapping: mapping,
    p_new_fields: proposedFields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description ?? "",
      data_type: field.type,
      semantic_role: field.role,
      required: field.required,
      searchable: field.searchable,
      filterable: field.filterable,
      ai_exposure: field.aiExposure,
      position: field.position,
      validation: field.validation ?? {},
    })),
    p_records: outcome.valid.map((record) => ({
      values: record.values,
      externalId: record.externalId,
      checksum: record.checksum,
    })),
    p_rejected_count: input.preview.rows.length - outcome.valid.length,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data || typeof data !== "object") throw mapDatabaseFailure(error);
  return data as {
    runId: string;
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    status: "succeeded" | "partial" | "failed";
    idempotent: boolean;
  };
};

export const importNewCollectionIngestion = async (
  context: BusinessDataContext,
  input: {
    definition: unknown;
    preview: IngestionPreview;
    mapping: unknown;
    externalIdField: unknown;
    idempotencyKey: unknown;
  }
) => {
  const { mapAndValidateRows } = await import("./ingestion");
  const definitionResult = validateCollectionDefinition(input.definition);
  if (!definitionResult.ok) throw invalidDefinition(definitionResult.issues);
  const definition = definitionResult.value;
  if (input.preview.sourceType !== "csv" && input.preview.sourceType !== "excel") {
    throw new BusinessDataServiceError("این نوع منبع برای ساخت مجموعه پشتیبانی نمی‌شود.", 400, "unsupported_source");
  }
  const { count, error: countError } = await context.admin
    .from("business_data_collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id);
  if (countError) throw mapDatabaseFailure(countError);
  if ((count ?? 0) >= BUSINESS_DATA_LIMITS.collectionsPerUser) {
    throw new BusinessDataServiceError("حداکثر تعداد مجموعه‌های این حساب ساخته شده است.", 409, "limit_exceeded");
  }
  const mapping = parseIngestionMapping(input.mapping);
  const externalIdField = typeof input.externalIdField === "string" ? input.externalIdField : null;
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(idempotencyKey)) {
    throw new BusinessDataServiceError("درخواست ورود داده معتبر نیست؛ دوباره تلاش کنید.", 400, "invalid_idempotency");
  }
  const outcome = mapAndValidateRows(input.preview, mapping, definition.fields, externalIdField);
  if (!outcome.valid.length) {
    throw new BusinessDataServiceError("هیچ ردیف معتبری برای ورود پیدا نشد.", 400, "no_valid_rows");
  }
  const stableId = createHash("sha256")
    .update(`${context.user.id}:${idempotencyKey}`)
    .digest("hex")
    .slice(0, 12);
  const collectionKey = `${definition.kind}_${stableId}`;
  const { data, error } = await context.admin.rpc("business_data_create_import_collection", {
    p_user_id: context.user.id,
    p_key: collectionKey,
    p_name: definition.name,
    p_description: definition.description,
    p_kind: definition.kind,
    p_access_scope: definition.accessScope,
    p_ai_enabled: definition.aiEnabled,
    p_status: definition.status,
    p_fields: definition.fields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description ?? "",
      data_type: field.type,
      semantic_role: field.role,
      required: field.required,
      searchable: field.searchable,
      filterable: field.filterable,
      ai_exposure: field.aiExposure,
      position: field.position,
      validation: field.validation ?? {},
    })),
    p_source_id: idempotencyUuid(context.user.id, idempotencyKey),
    p_source_type: input.preview.sourceType,
    p_source_name: input.preview.sourceName.slice(0, BUSINESS_DATA_LIMITS.sourceNameChars),
    p_source_configuration: { importedFrom: "file", sheetName: input.preview.sheetName },
    p_field_mapping: mapping,
    p_records: outcome.valid.map((record) => ({
      values: record.values,
      externalId: record.externalId,
      checksum: record.checksum,
    })),
    p_rejected_count: input.preview.rows.length - outcome.valid.length,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data || typeof data !== "object") throw mapDatabaseFailure(error);
  invalidateBusinessDataAiCapabilities(context.user.id);
  return data as {
    collectionId: string;
    runId: string;
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    status: "succeeded" | "partial" | "failed";
    idempotent: boolean;
  };
};
