import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Platform-wide AI settings + per-business usage/limits.
// Backed by supabase/admin.sql (ai_global_settings, ai_usage_log,
// ai_business_limits). Every read here FAILS OPEN with defaults so the
// assistant keeps working before the SQL script has been run.
// ---------------------------------------------------------------------------

export type GlobalAiSettings = {
  aiEnabled: boolean;
  qaMinSimilarity: number;
  chunkMinSimilarity: number;
  chunkMatchCount: number;
  qaMatchCount: number;
  intentEnabled: boolean;
};

export const DEFAULT_GLOBAL_AI_SETTINGS: GlobalAiSettings = {
  aiEnabled: true,
  qaMinSimilarity: 0.45,
  chunkMinSimilarity: 0.2,
  chunkMatchCount: 4,
  qaMatchCount: 2,
  intentEnabled: true,
};

// Settings change rarely; cache briefly so the Telegram webhook does not add
// a settings query to every single customer message.
const SETTINGS_CACHE_TTL_MS = 30_000;
let settingsCache: { value: GlobalAiSettings; expiresAt: number } | null = null;

export const invalidateGlobalAiSettingsCache = () => {
  settingsCache = null;
};

export const getGlobalAiSettings = async (): Promise<GlobalAiSettings> => {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) return settingsCache.value;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_global_settings")
      .select(
        "ai_enabled, qa_min_similarity, chunk_min_similarity, chunk_match_count, qa_match_count, intent_enabled"
      )
      .eq("id", 1)
      .maybeSingle();

    const value: GlobalAiSettings = data
      ? {
          aiEnabled: data.ai_enabled === true,
          qaMinSimilarity: Number(data.qa_min_similarity) || DEFAULT_GLOBAL_AI_SETTINGS.qaMinSimilarity,
          chunkMinSimilarity: Number(data.chunk_min_similarity) || DEFAULT_GLOBAL_AI_SETTINGS.chunkMinSimilarity,
          chunkMatchCount: Number(data.chunk_match_count) || DEFAULT_GLOBAL_AI_SETTINGS.chunkMatchCount,
          qaMatchCount: Number(data.qa_match_count) || DEFAULT_GLOBAL_AI_SETTINGS.qaMatchCount,
          intentEnabled: data.intent_enabled === true,
        }
      : DEFAULT_GLOBAL_AI_SETTINGS;

    settingsCache = { value, expiresAt: now + SETTINGS_CACHE_TTL_MS };
    return value;
  } catch {
    return DEFAULT_GLOBAL_AI_SETTINGS;
  }
};

// ---------------------------------------------------------------------------
// Usage logging — best-effort, never throws into the caller's flow.
// ---------------------------------------------------------------------------

export type UsageTokens = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

export const logAiUsage = async ({
  userId,
  kind,
  provider,
  model,
  usage,
}: {
  userId: string;
  kind: "chat" | "intent";
  provider: string;
  model: string;
  usage: UsageTokens | null | undefined;
}): Promise<void> => {
  const prompt = Math.max(0, Math.floor(usage?.prompt_tokens ?? 0));
  const completion = Math.max(0, Math.floor(usage?.completion_tokens ?? 0));
  const total = Math.max(
    0,
    Math.floor(usage?.total_tokens ?? prompt + completion)
  );

  try {
    const admin = createAdminClient();
    await admin.from("ai_usage_log").insert({
      user_id: userId,
      kind,
      provider,
      model,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
    });
  } catch {
    // Usage accounting must never break the reply path.
  }
};

// ---------------------------------------------------------------------------
// Limit checks — monthly window, NULL limit = unlimited.
// ---------------------------------------------------------------------------

export type AiLimitCheck = {
  allowed: boolean;
  /** Which gate rejected the call — for logging only, never user-facing. */
  reason: "blocked" | "tokens" | "messages" | null;
};

/** First instant of the current calendar month (UTC). */
const monthStartIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

/**
 * Check whether a business may make another AI call this month. Fails open:
 * missing tables / RPC errors allow the call rather than silencing every bot.
 */
export const checkAiLimits = async (userId: string): Promise<AiLimitCheck> => {
  try {
    const admin = createAdminClient();
    const { data: limits } = await admin
      .from("ai_business_limits")
      .select("monthly_token_limit, monthly_message_limit, ai_blocked")
      .eq("user_id", userId)
      .maybeSingle();

    if (!limits) return { allowed: true, reason: null };
    if (limits.ai_blocked === true) return { allowed: false, reason: "blocked" };

    const tokenLimit = limits.monthly_token_limit as number | null;
    const messageLimit = limits.monthly_message_limit as number | null;
    if (tokenLimit === null && messageLimit === null) {
      return { allowed: true, reason: null };
    }

    const { data: totals } = await admin.rpc("ai_usage_totals", {
      for_user: userId,
      since: monthStartIso(),
    });
    const row = Array.isArray(totals) ? totals[0] : totals;
    const usedTokens = Number(row?.total_tokens ?? 0);
    const usedMessages = Number(row?.chat_count ?? 0);

    if (tokenLimit !== null && usedTokens >= tokenLimit) {
      return { allowed: false, reason: "tokens" };
    }
    if (messageLimit !== null && usedMessages >= messageLimit) {
      return { allowed: false, reason: "messages" };
    }
    return { allowed: true, reason: null };
  } catch {
    return { allowed: true, reason: null };
  }
};
