import "server-only";

import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import type { BusinessDataFieldDefinition } from "./types";
import {
  BusinessDataIngestionError,
  buildImportPreview,
  parseSupabaseRowsForPreview,
  resolveIngestionTitle,
  suggestedFieldDefinitions,
  suggestedMapping,
} from "./ingestion";
import {
  BusinessDataServiceError,
  getCollectionDetail,
  importIngestion,
  type BusinessDataContext,
} from "./server";
import {
  parseSupabaseApiKey,
  parseSupabaseProjectUrl,
  readSupabaseTable,
  type SupabaseConnectorCredentials,
} from "./supabase-connector";

type SupabaseSourceRow = {
  id: string;
  configuration: Record<string, unknown>;
  field_mapping: Record<string, string | null>;
};

const getSupabaseSource = async (
  context: BusinessDataContext,
  collectionId: string
): Promise<SupabaseSourceRow | null> => {
  const { data, error } = await context.admin
    .from("business_data_sources")
    .select("id, configuration, field_mapping")
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .eq("source_type", "supabase")
    .maybeSingle();
  if (error) {
    throw new BusinessDataServiceError(
      "خواندن منبع داده ممکن نبود.",
      500,
      "database_error"
    );
  }
  return data as SupabaseSourceRow | null;
};

const makePreviewResponse = async (
  context: BusinessDataContext,
  collectionId: string,
  tableName: string,
  credentials: SupabaseConnectorCredentials
) => {
  const collection = await getCollectionDetail(context, collectionId);
  const table = await readSupabaseTable(credentials, tableName);
  let preview;
  try {
    preview = parseSupabaseRowsForPreview({
      tableName,
      rows: table.rows,
      columns: table.columns,
    });
  } catch (error) {
    if (error instanceof BusinessDataIngestionError && error.code === "empty_source") {
      throw new BusinessDataServiceError(
        "جدول انتخاب‌شده ردیفی برای همگام‌سازی ندارد.",
        400,
        "empty_table"
      );
    }
    throw error;
  }
  const existingTitle = collection.fields.find((field) => field.role === "title") ?? null;
  const titleResolution = resolveIngestionTitle(
    preview,
    suggestedFieldDefinitions(preview, { fallbackTitle: false }),
    existingTitle?.key
  );
  const fields = collection.fields;
  const mapping = suggestedMapping(preview, fields);
  const suggested = titleResolution.fields;
  const usedKeys = new Set(fields.map((field) => field.key));
  const newFields: BusinessDataFieldDefinition[] = [];
  for (const column of preview.columns) {
    if (mapping[column.key]) continue;
    const candidate = suggested.find((field) => field.key === column.key);
    if (!candidate) continue;
    let key = candidate.key;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${candidate.key}_${suffix}`;
      suffix += 1;
    }
    const definition = { ...candidate, key, position: fields.length + newFields.length };
    newFields.push(definition);
    usedKeys.add(key);
    mapping[column.key] = key;
  }
  const identifier = preview.columns.find((column) => column.uniqueCandidate);
  const externalIdField = identifier ? mapping[identifier.key] ?? null : null;
  const result = buildImportPreview(
    preview,
    [...fields, ...newFields],
    mapping,
    externalIdField
  );
  return {
    preview: {
      sourceType: result.sourceType,
      sourceName: result.sourceName,
      sheetName: result.sheetName,
      sheetNames: result.sheetNames,
      columns: result.columns,
      sampleRows: result.sampleRows,
      rowCount: result.rows.length,
      warnings: result.warnings,
      validCount: result.validCount,
      rejectedCount: result.rejectedCount,
      rejectedRows: result.rejectedRows,
      hasStableIdentifier: result.hasStableIdentifier,
    },
    fields,
    newFields,
    mapping,
    externalIdField,
  };
};

export const saveSupabaseConnection = async (
  context: BusinessDataContext,
  input: { collectionId: string; projectUrl: unknown; apiKey: unknown; tableName: unknown }
) => {
  const projectUrl = parseSupabaseProjectUrl(input.projectUrl);
  const apiKey = parseSupabaseApiKey(input.apiKey);
  const tableName =
    typeof input.tableName === "string" && input.tableName.length <= 120
      ? input.tableName
      : "";
  if (!tableName) {
    throw new BusinessDataServiceError("یک جدول را انتخاب کنید.", 400, "missing_table");
  }
  const preview = await makePreviewResponse(
    context,
    input.collectionId,
    tableName,
    { projectUrl, apiKey }
  );
  const existing = await getSupabaseSource(context, input.collectionId);
  const sourceId = existing?.id ?? randomUUID();
  const configuration = {
    projectHost: new URL(projectUrl).hostname,
    tableName,
    importedFrom: "supabase",
    externalIdField: preview.externalIdField,
  };
  const { error: sourceError } = await context.admin
    .from("business_data_sources")
    .upsert({
      id: sourceId,
      user_id: context.user.id,
      collection_id: input.collectionId,
      name: `Supabase · ${tableName}`,
      source_type: "supabase",
      status: "pending",
      configuration,
      field_mapping: preview.mapping,
      last_error: null,
    });
  if (sourceError) {
    throw new BusinessDataServiceError(
      "ذخیره اتصال انجام نشد؛ دوباره تلاش کنید.",
      500,
      "save_failed"
    );
  }
  const { error: secretError } = await context.admin
    .from("business_data_source_secrets")
    .upsert({
      source_id: sourceId,
      user_id: context.user.id,
      collection_id: input.collectionId,
      secret_ciphertext: encryptSecret(JSON.stringify({ projectUrl, apiKey })),
      token_hash: null,
      token_prefix: null,
      rotated_at: new Date().toISOString(),
    });
  if (secretError) {
    await context.admin
      .from("business_data_sources")
      .update({ status: "error", last_error: "ذخیره امن کلید اتصال انجام نشد." })
      .eq("id", sourceId)
      .eq("user_id", context.user.id)
      .eq("collection_id", input.collectionId);
    throw new BusinessDataServiceError(
      "ذخیره امن کلید اتصال انجام نشد.",
      500,
      "secret_save_failed"
    );
  }
  return preview;
};

const loadCredentials = async (
  context: BusinessDataContext,
  collectionId: string,
  sourceId: string
): Promise<SupabaseConnectorCredentials> => {
  const { data, error } = await context.admin
    .from("business_data_source_secrets")
    .select("secret_ciphertext")
    .eq("source_id", sourceId)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error || typeof data?.secret_ciphertext !== "string") {
    throw new BusinessDataServiceError(
      "کلید اتصال پیدا نشد؛ اتصال را دوباره ثبت کنید.",
      409,
      "connection_missing"
    );
  }
  try {
    const parsed = JSON.parse(decryptSecret(data.secret_ciphertext)) as Record<string, unknown>;
    return {
      projectUrl: parseSupabaseProjectUrl(parsed.projectUrl),
      apiKey: parseSupabaseApiKey(parsed.apiKey),
    };
  } catch {
    throw new BusinessDataServiceError(
      "خواندن امن کلید اتصال ممکن نبود؛ اتصال را دوباره ثبت کنید.",
      409,
      "connection_invalid"
    );
  }
};

const recordSyncFailure = async (
  context: BusinessDataContext,
  collectionId: string,
  sourceId: string,
  idempotencyKey: string
) => {
  const now = new Date().toISOString();
  await context.admin.from("business_data_sync_runs").insert({
    user_id: context.user.id,
    collection_id: collectionId,
    source_id: sourceId,
    status: "failed",
    idempotency_key: idempotencyKey,
    failed_count: 1,
    error_summary: "همگام‌سازی Supabase کامل نشد.",
    started_at: now,
    completed_at: now,
  });
  await context.admin
    .from("business_data_sources")
    .update({
      status: "error",
      last_attempted_at: now,
      last_error: "همگام‌سازی کامل نشد؛ اتصال و دسترسی جدول را بررسی کنید.",
    })
    .eq("id", sourceId)
    .eq("collection_id", collectionId)
    .eq("user_id", context.user.id);
};

export const syncSupabaseConnection = async (
  context: BusinessDataContext,
  input: {
    collectionId: string;
    mapping?: unknown;
    newFields?: unknown;
    externalIdField?: unknown;
    idempotencyKey: unknown;
  }
) => {
  await getCollectionDetail(context, input.collectionId);
  const source = await getSupabaseSource(context, input.collectionId);
  if (!source) {
    throw new BusinessDataServiceError(
      "ابتدا اتصال Supabase را ثبت کنید.",
      409,
      "connection_missing"
    );
  }
  const idempotencyKey =
    typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(idempotencyKey)) {
    throw new BusinessDataServiceError(
      "درخواست همگام‌سازی معتبر نیست.",
      400,
      "invalid_idempotency"
    );
  }
  try {
    const credentials = await loadCredentials(context, input.collectionId, source.id);
    const tableName =
      typeof source.configuration.tableName === "string"
        ? source.configuration.tableName
        : "";
    if (!tableName) {
      throw new BusinessDataServiceError(
        "جدول متصل‌شده مشخص نیست؛ اتصال را دوباره ثبت کنید.",
        409,
        "connection_invalid"
      );
    }
    const table = await readSupabaseTable(credentials, tableName);
    const preview = parseSupabaseRowsForPreview({
      tableName,
      rows: table.rows,
      columns: table.columns,
    });
    const externalIdField =
      input.externalIdField ?? source.configuration.externalIdField ?? null;
    if (typeof externalIdField !== "string" || !externalIdField) {
      throw new BusinessDataServiceError(
        "برای همگام‌سازی‌های بعدی یک شناسه یکتا انتخاب کنید.",
        400,
        "identifier_required"
      );
    }
    return await importIngestion(context, {
      collectionId: input.collectionId,
      preview,
      mapping: input.mapping ?? source.field_mapping,
      newFields: input.newFields ?? [],
      externalIdField,
      idempotencyKey,
    });
  } catch (error) {
    await recordSyncFailure(context, input.collectionId, source.id, idempotencyKey);
    throw error;
  }
};
