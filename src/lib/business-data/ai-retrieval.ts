import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_DATA_LIMITS } from "./limits";
import {
  buildBusinessDataCapabilitySummary,
  minimizeBusinessDataResult,
  selectBusinessDataProjection,
  validateBusinessDataLookupPlan,
  type BusinessDataAiField,
  type BusinessDataCapability,
  type BusinessDataLookupPlan,
  type BusinessDataLookupResult,
} from "./ai-retrieval-core";

type CollectionRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  kind: BusinessDataCapability["kind"];
  schema_version: number;
};

type FieldRow = {
  collection_id: string;
  key: string;
  label: string;
  data_type: BusinessDataAiField["type"];
  semantic_role: BusinessDataAiField["role"];
  searchable: boolean;
  filterable: boolean;
  ai_exposure: BusinessDataAiField["aiExposure"];
  position: number;
};

const CAPABILITY_CACHE_TTL_MS = 60_000;
const capabilityCache = new Map<
  string,
  { expiresAt: number; value: BusinessDataCapability[] }
>();

export const invalidateBusinessDataAiCapabilities = (userId: string) => {
  capabilityCache.delete(userId);
};

export const getBusinessDataAiCapabilities = async (
  userId: string
): Promise<BusinessDataCapability[]> => {
  const cached = capabilityCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const admin = createAdminClient();
  const { data: collectionRows, error: collectionError } = await admin
    .from("business_data_collections")
    .select("id, key, name, description, kind, schema_version")
    .eq("user_id", userId)
    .eq("access_scope", "public_catalog")
    .eq("ai_enabled", true)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(BUSINESS_DATA_LIMITS.aiCapabilityCollections);
  if (collectionError) throw new Error(`Business Data capabilities failed: ${collectionError.message}`);

  const collections = (collectionRows ?? []) as CollectionRow[];
  if (!collections.length) {
    capabilityCache.set(userId, { expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS, value: [] });
    return [];
  }

  const { data: fieldRows, error: fieldError } = await admin
    .from("business_data_fields")
    .select(
      "collection_id, key, label, data_type, semantic_role, searchable, filterable, ai_exposure, position"
    )
    .eq("user_id", userId)
    .in("collection_id", collections.map((collection) => collection.id))
    .neq("ai_exposure", "hidden")
    .order("position", { ascending: true });
  if (fieldError) throw new Error(`Business Data fields failed: ${fieldError.message}`);

  const fields = (fieldRows ?? []) as FieldRow[];
  const capabilities = collections.map((collection) => ({
    key: collection.key,
    name: collection.name,
    description: collection.description,
    kind: collection.kind,
    schemaVersion: collection.schema_version,
    fields: fields
      .filter((field) => field.collection_id === collection.id)
      .map((field) => ({
        key: field.key,
        label: field.label,
        type: field.data_type,
        role: field.semantic_role,
        searchable: field.searchable,
        filterable: field.filterable,
        aiExposure: field.ai_exposure,
        position: field.position,
      })),
  }));
  capabilityCache.set(userId, {
    expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
    value: capabilities,
  });
  return capabilities;
};

export const describeBusinessDataAiCapabilities = (
  capabilities: BusinessDataCapability[]
) => buildBusinessDataCapabilitySummary(capabilities);

export const lookupBusinessData = async ({
  capabilities,
  rawPlan,
  userId,
}: {
  capabilities: BusinessDataCapability[];
  rawPlan: unknown;
  userId: string;
}): Promise<BusinessDataLookupResult | null> => {
  const plan = validateBusinessDataLookupPlan(rawPlan, capabilities);
  if (!plan) return null;
  const capability = capabilities.find((item) => item.key === plan.collection);
  if (!capability) return null;
  const projection = selectBusinessDataProjection(capability, plan);
  if (!projection.length) return null;

  const startedAt = performance.now();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("business_data_lookup_public", {
    p_user_id: userId,
    p_collection_key: plan.collection,
    p_query: plan.query,
    p_filters: plan.filters,
    p_sort: plan.sort,
    p_projection_keys: projection.map((field) => field.key),
    p_limit: plan.limit,
  });
  if (error) throw new Error(`Business Data lookup failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    record_values: Record<string, unknown>;
    data_updated_at: string | null;
    matched_count: number | string;
  }>;
  const result = minimizeBusinessDataResult({
    capability,
    durationMs: Math.round(performance.now() - startedAt),
    matchedCount: Number(rows[0]?.matched_count ?? 0),
    plan,
    rows: rows.map((row) => ({
      values: row.record_values ?? {},
      dataUpdatedAt: row.data_updated_at,
    })),
  });

  console.info("Business Data retrieval", {
    collectionKind: result.collectionKind,
    matched: result.matchedCount,
    returned: result.records.length,
    payloadChars: result.payloadChars,
    durationMs: result.durationMs,
    truncated: result.truncated,
  });
  return result;
};

export type { BusinessDataLookupPlan, BusinessDataLookupResult };
