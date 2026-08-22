import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  minimizeBusinessDataResult,
  selectBusinessDataProjection,
  type BusinessDataCapability,
  type BusinessDataLookupPlan,
  type BusinessDataLookupResult,
} from "./ai-retrieval-core";
import { BUSINESS_DATA_LIMITS } from "./limits";

export type PrivateAccessIdentity = {
  channel: "telegram" | "instagram";
  connectionId: string;
  customerExternalId: string;
};

export type PrivateBusinessDataCapability = Pick<
  BusinessDataCapability,
  "key" | "name" | "kind"
>;

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
  data_type: BusinessDataCapability["fields"][number]["type"];
  semantic_role: BusinessDataCapability["fields"][number]["role"];
  searchable: boolean;
  filterable: boolean;
  ai_exposure: BusinessDataCapability["fields"][number]["aiExposure"];
  position: number;
};

type ConfigRow = {
  collection_id: string;
  enabled: boolean;
  locator_field_id: string;
  verification_field_id: string;
};

type ConfigFieldRow = {
  id: string;
  label: string;
  semantic_role: string;
  required: boolean;
  filterable: boolean;
  ai_exposure: string;
};

type ChallengeRow = {
  id: string;
  collection_id: string;
  candidate_record_id: string | null;
  pending_question: string;
  step: "locator" | "verification";
  expires_at: string;
};

const verificationIdentityHash = (identity: PrivateAccessIdentity) =>
  createHash("sha256")
    .update(
      `${identity.channel}:${identity.connectionId}:${identity.customerExternalId}`,
      "utf8"
    )
    .digest("hex");

const truncate = (value: string, maximum: number) =>
  Array.from(value).slice(0, maximum).join("");

const isConfigFieldUsable = (field: ConfigFieldRow | undefined) =>
  Boolean(
    field &&
      field.required &&
      field.filterable &&
      field.ai_exposure === "filter_only"
  );

const getPrivateRows = async (userId: string) => {
  const admin = createAdminClient();
  const { data: collectionData, error: collectionError } = await admin
    .from("business_data_collections")
    .select("id, key, name, description, kind, schema_version")
    .eq("user_id", userId)
    .eq("access_scope", "verified_customer")
    .eq("ai_enabled", true)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(BUSINESS_DATA_LIMITS.privateCapabilityCollections);
  if (collectionError) {
    throw new Error(`Private Business Data capability discovery failed: ${collectionError.message}`);
  }
  const collections = (collectionData ?? []) as CollectionRow[];
  if (!collections.length) return { collections, configs: [], fields: [] };

  const collectionIds = collections.map((collection) => collection.id);
  const [configResult, fieldResult] = await Promise.all([
    admin
      .from("business_data_private_access_configs")
      .select("collection_id, enabled, locator_field_id, verification_field_id")
      .eq("user_id", userId)
      .eq("enabled", true)
      .in("collection_id", collectionIds),
    admin
      .from("business_data_fields")
      .select(
        "id, collection_id, key, label, data_type, semantic_role, required, searchable, filterable, ai_exposure, position"
      )
      .eq("user_id", userId)
      .in("collection_id", collectionIds)
      .order("position", { ascending: true }),
  ]);
  if (configResult.error || fieldResult.error) {
    throw new Error(
      `Private Business Data metadata failed: ${(configResult.error ?? fieldResult.error)?.message}`
    );
  }
  return {
    collections,
    configs: (configResult.data ?? []) as ConfigRow[],
    fields: (fieldResult.data ?? []) as Array<FieldRow & ConfigFieldRow>,
  };
};

const eligiblePrivateCollections = async (userId: string) => {
  const { collections, configs, fields } = await getPrivateRows(userId);
  return collections.filter((collection) => {
    const config = configs.find((item) => item.collection_id === collection.id);
    if (!config?.enabled) return false;
    const locator = fields.find((field) => field.id === config.locator_field_id);
    const verifier = fields.find(
      (field) => field.id === config.verification_field_id
    );
    return (
      config.locator_field_id !== config.verification_field_id &&
      isConfigFieldUsable(locator) &&
      isConfigFieldUsable(verifier)
    );
  });
};

export const getPrivateBusinessDataCapabilities = async (
  userId: string
): Promise<PrivateBusinessDataCapability[]> => {
  const collections = await eligiblePrivateCollections(userId);
  return collections.map((collection) => ({
    key: collection.key,
    name: collection.name,
    kind: collection.kind,
  }));
};

export const describePrivateBusinessDataCapabilities = (
  capabilities: PrivateBusinessDataCapability[]
) => {
  const lines: string[] = [];
  let characters = 0;
  for (const capability of capabilities.slice(
    0,
    BUSINESS_DATA_LIMITS.privateCapabilityCollections
  )) {
    const line = JSON.stringify({
      collection: capability.key,
      name: truncate(capability.name, 60),
      kind: capability.kind,
    });
    if (
      characters + line.length > BUSINESS_DATA_LIMITS.privateCapabilitySummaryChars &&
      lines.length > 0
    ) {
      break;
    }
    lines.push(line);
    characters += line.length;
  }
  return lines.join("\n");
};

const getCollectionPrivateConfig = async ({
  collectionKey,
  userId,
}: {
  collectionKey: string;
  userId: string;
}) => {
  const { collections, configs, fields } = await getPrivateRows(userId);
  const collection = collections.find((item) => item.key === collectionKey);
  if (!collection) return null;
  const config = configs.find((item) => item.collection_id === collection.id);
  if (!config?.enabled) return null;
  const locator = fields.find((field) => field.id === config.locator_field_id);
  const verifier = fields.find(
    (field) => field.id === config.verification_field_id
  );
  if (
    config.locator_field_id === config.verification_field_id ||
    !isConfigFieldUsable(locator) ||
    !isConfigFieldUsable(verifier) ||
    !locator ||
    !verifier
  ) {
    return null;
  }
  return { collection, locator, verifier };
};

const getActiveChallenge = async ({
  identity,
  userId,
}: {
  identity: PrivateAccessIdentity;
  userId: string;
}) => {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("business_data_private_verification_challenges")
    .select("id, collection_id, candidate_record_id, pending_question, step, expires_at")
    .eq("user_id", userId)
    .eq("channel", identity.channel)
    .eq("connection_id", identity.connectionId)
    .eq("customer_identity_hash", verificationIdentityHash(identity))
    .gt("expires_at", now)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Private verification state failed: ${error.message}`);
  return (data as ChallengeRow | null) ?? null;
};

const upsertChallenge = async ({
  collectionId,
  identity,
  userId,
  candidateRecordId,
  pendingQuestion,
  step,
}: {
  collectionId: string;
  identity: PrivateAccessIdentity;
  userId: string;
  candidateRecordId: string | null;
  pendingQuestion: string;
  step: ChallengeRow["step"];
}) => {
  const { error } = await createAdminClient()
    .from("business_data_private_verification_challenges")
    .upsert(
      {
        user_id: userId,
        collection_id: collectionId,
        channel: identity.channel,
        connection_id: identity.connectionId,
        customer_identity_hash: verificationIdentityHash(identity),
        candidate_record_id: candidateRecordId,
        pending_question: truncate(pendingQuestion.trim(), 600),
        step,
        expires_at: new Date(
          Date.now() + BUSINESS_DATA_LIMITS.privateVerificationTtlMs
        ).toISOString(),
      },
      {
        onConflict:
          "user_id,collection_id,channel,connection_id,customer_identity_hash",
      }
    );
  if (error) throw new Error(`Private verification state failed: ${error.message}`);
};

const deleteChallenge = async (challengeId: string) => {
  const { error } = await createAdminClient()
    .from("business_data_private_verification_challenges")
    .delete()
    .eq("id", challengeId);
  if (error) throw new Error(`Private verification state failed: ${error.message}`);
};

const fieldPrompt = (label: string, kind: "locator" | "verification") =>
  kind === "locator"
    ? `برای بررسی، ${label} را بفرستید.`
    : `برای تأیید اطلاعات، ${label} را هم بفرستید.`;

export const startPrivateVerification = async ({
  collectionKey,
  identity,
  question,
  userId,
}: {
  collectionKey: string;
  identity: PrivateAccessIdentity;
  question: string;
  userId: string;
}) => {
  const config = await getCollectionPrivateConfig({ collectionKey, userId });
  if (!config) return null;
  const existingSession = await createAdminClient()
    .from("business_data_verified_customer_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("collection_id", config.collection.id)
    .eq("channel", identity.channel)
    .eq("connection_id", identity.connectionId)
    .eq("customer_identity_hash", verificationIdentityHash(identity))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingSession.error) {
    throw new Error(`Private verification session failed: ${existingSession.error.message}`);
  }
  if (existingSession.data) return { state: "verified" as const };

  await upsertChallenge({
    collectionId: config.collection.id,
    identity,
    userId,
    candidateRecordId: null,
    pendingQuestion: question,
    step: "locator",
  });
  return {
    state: "required" as const,
    collectionKey: config.collection.key,
    message: fieldPrompt(config.locator.label, "locator"),
  };
};

export type PrivateVerificationHandling =
  | { handled: false }
  | { handled: true; reply: string; verifiedQuestion?: string; collectionKey?: string };

export const handlePrivateVerificationMessage = async ({
  identity,
  message,
  userId,
}: {
  identity: PrivateAccessIdentity;
  message: string;
  userId: string;
}): Promise<PrivateVerificationHandling> => {
  const challenge = await getActiveChallenge({ identity, userId });
  if (!challenge) return { handled: false };
  if (/^(لغو|انصراف|cancel)$/iu.test(message.trim())) {
    await deleteChallenge(challenge.id);
    return { handled: true, reply: "فرایند تأیید لغو شد." };
  }

  const admin = createAdminClient();
  const { data: collectionData, error: collectionError } = await admin
    .from("business_data_collections")
    .select("key")
    .eq("id", challenge.collection_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (collectionError || !collectionData) {
    await deleteChallenge(challenge.id);
    return { handled: true, reply: "امکان بررسی این درخواست در حال حاضر نیست." };
  }
  const config = await getCollectionPrivateConfig({
    collectionKey: (collectionData as { key: string }).key,
    userId,
  });
  if (!config) {
    await deleteChallenge(challenge.id);
    return { handled: true, reply: "امکان بررسی این درخواست در حال حاضر نیست." };
  }

  const submitted = truncate(message.trim(), 200);
  if (!submitted) return { handled: true, reply: fieldPrompt(
    challenge.step === "locator" ? config.locator.label : config.verifier.label,
    challenge.step
  ) };

  if (challenge.step === "locator") {
    const { data, error } = await admin.rpc("business_data_private_find_candidate", {
      p_user_id: userId,
      p_collection_key: config.collection.key,
      p_locator_value: submitted,
    });
    if (error) throw new Error(`Private verification candidate failed: ${error.message}`);
    await upsertChallenge({
      collectionId: config.collection.id,
      identity,
      userId,
      candidateRecordId: typeof data === "string" ? data : null,
      pendingQuestion: challenge.pending_question,
      step: "verification",
    });
    return { handled: true, reply: fieldPrompt(config.verifier.label, "verification") };
  }

  const { data, error } = await admin.rpc("business_data_private_verify", {
    p_user_id: userId,
    p_collection_key: config.collection.key,
    p_candidate_record_id: challenge.candidate_record_id,
    p_verification_value: submitted,
    p_channel: identity.channel,
    p_connection_id: identity.connectionId,
    p_customer_identity_hash: verificationIdentityHash(identity),
  });
  await deleteChallenge(challenge.id);
  if (error || data !== true) {
    console.info("Private Business Data verification", {
      collectionKind: config.collection.kind,
      outcome: "failure",
    });
    return {
      handled: true,
      reply: "اطلاعات واردشده برای تأیید کافی نبود. دوباره از ابتدا درخواست را بفرستید.",
    };
  }
  console.info("Private Business Data verification", {
    collectionKind: config.collection.kind,
    outcome: "success",
  });
  return {
    handled: true,
    reply: "",
    verifiedQuestion: challenge.pending_question,
    collectionKey: config.collection.key,
  };
};

export const lookupVerifiedBusinessData = async ({
  collectionKey,
  identity,
  userId,
}: {
  collectionKey: string;
  identity: PrivateAccessIdentity;
  userId: string;
}): Promise<BusinessDataLookupResult | null> => {
  const collections = await eligiblePrivateCollections(userId);
  const collection = collections.find((item) => item.key === collectionKey);
  if (!collection) return null;
  const { fields } = await getPrivateRows(userId);
  const capability: BusinessDataCapability = {
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
        searchable: false,
        filterable: field.filterable,
        aiExposure: field.ai_exposure,
        position: field.position,
      })),
  };
  const plan: BusinessDataLookupPlan = {
    collection: collection.key,
    query: null,
    filters: [],
    sort: null,
    limit: 1,
  };
  const projection = selectBusinessDataProjection(capability, plan);
  if (!projection.length) return null;
  const startedAt = performance.now();
  const { data, error } = await createAdminClient().rpc(
    "business_data_lookup_verified_customer",
    {
      p_user_id: userId,
      p_collection_key: collection.key,
      p_channel: identity.channel,
      p_connection_id: identity.connectionId,
      p_customer_identity_hash: verificationIdentityHash(identity),
      p_projection_keys: projection.map((field) => field.key),
    }
  );
  if (error) throw new Error(`Private Business Data lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<{
    record_values: Record<string, unknown>;
    data_updated_at: string | null;
  }>;
  const result = minimizeBusinessDataResult({
    capability,
    durationMs: Math.round(performance.now() - startedAt),
    matchedCount: rows.length,
    plan,
    rows: rows.map((row) => ({
      values: row.record_values ?? {},
      dataUpdatedAt: row.data_updated_at,
    })),
  });
  console.info("Private Business Data retrieval", {
    collectionKind: result.collectionKind,
    records: result.records.length,
    payloadChars: result.payloadChars,
    durationMs: result.durationMs,
  });
  return result;
};
