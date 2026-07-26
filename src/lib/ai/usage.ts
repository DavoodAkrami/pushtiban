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
  /** Empty string = fall back to the provider's env var / built-in default. */
  chatModel: string;
};

export const DEFAULT_GLOBAL_AI_SETTINGS: GlobalAiSettings = {
  aiEnabled: true,
  qaMinSimilarity: 0.45,
  chunkMinSimilarity: 0.2,
  chunkMatchCount: 4,
  qaMatchCount: 2,
  intentEnabled: true,
  chatModel: "",
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
        "ai_enabled, qa_min_similarity, chunk_min_similarity, chunk_match_count, qa_match_count, intent_enabled, chat_model"
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
          chatModel:
            typeof data.chat_model === "string" ? data.chat_model.trim() : "",
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
// Bucketed usage series — feeds the admin and overview charts.
// ---------------------------------------------------------------------------

export type UsageRange = "week" | "month" | "year";

export const USAGE_RANGES: UsageRange[] = ["week", "month", "year"];

export const isUsageRange = (value: unknown): value is UsageRange =>
  typeof value === "string" && (USAGE_RANGES as string[]).includes(value);

const RANGE_SHAPE: Record<
  UsageRange,
  { bucket: "day" | "month"; buckets: number }
> = {
  week: { bucket: "day", buckets: 7 },
  month: { bucket: "day", buckets: 30 },
  year: { bucket: "month", buckets: 12 },
};

export type UsagePoint = {
  /** UTC ISO timestamp of the bucket start. */
  bucket: string;
  /** Ready-to-render Persian label ("۵ مرداد" / "مرداد"). */
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  messages: number;
};

export type UsageSeries = {
  range: UsageRange;
  points: UsagePoint[];
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    messages: number;
  };
};

const DAY_MS = 86_400_000;

/** Every bucket start in the window, oldest first, aligned to UTC. */
const bucketStarts = (range: UsageRange): Date[] => {
  const { bucket, buckets } = RANGE_SHAPE[range];
  const now = new Date();
  const starts: Date[] = [];

  if (bucket === "day") {
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    for (let index = buckets - 1; index >= 0; index -= 1) {
      starts.push(new Date(todayUtc - index * DAY_MS));
    }
    return starts;
  }

  for (let index = buckets - 1; index >= 0; index -= 1) {
    starts.push(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    );
  }
  return starts;
};

// Persian (Jalali) labels, formatted once per request rather than per point.
const dayLabeller = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const monthLabeller = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  month: "long",
  timeZone: "UTC",
});

/**
 * Token and message usage bucketed over the requested window — per day for
 * week/month, per month for year. Empty buckets are included with zeros so the
 * chart keeps a continuous axis. Fails open with an all-zero series when the
 * RPC is missing (admin.sql not run yet).
 */
export const getUsageSeries = async ({
  range,
  userId,
}: {
  range: UsageRange;
  /** Omit for platform-wide totals across every business. */
  userId?: string | null;
}): Promise<UsageSeries> => {
  const { bucket } = RANGE_SHAPE[range];
  const starts = bucketStarts(range);
  const label = bucket === "day" ? dayLabeller : monthLabeller;

  type SeriesRow = {
    bucket_start: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    chat_count: number;
  };

  const byBucket = new Map<string, SeriesRow>();
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("ai_usage_series", {
      bucket,
      since: starts[0].toISOString(),
      for_user: userId ?? null,
    });
    for (const row of (data ?? []) as SeriesRow[]) {
      byBucket.set(new Date(row.bucket_start).toISOString(), row);
    }
  } catch {
    // Fall through to an all-zero series.
  }

  const points: UsagePoint[] = starts.map((start) => {
    const row = byBucket.get(start.toISOString());
    return {
      bucket: start.toISOString(),
      label: label.format(start),
      promptTokens: Number(row?.prompt_tokens ?? 0),
      completionTokens: Number(row?.completion_tokens ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      messages: Number(row?.chat_count ?? 0),
    };
  });

  return {
    range,
    points,
    totals: {
      promptTokens: points.reduce((sum, p) => sum + p.promptTokens, 0),
      completionTokens: points.reduce((sum, p) => sum + p.completionTokens, 0),
      totalTokens: points.reduce((sum, p) => sum + p.totalTokens, 0),
      messages: points.reduce((sum, p) => sum + p.messages, 0),
    },
  };
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
 * Messages a brand-new business gets per month. Enforced by the signup trigger
 * in supabase/admin.sql; mirrored here for copy and for the fallback used when
 * a limits row is somehow missing.
 */
export const DEFAULT_SIGNUP_MESSAGE_LIMIT = 20;

export type BusinessUsageSnapshot = {
  monthPromptTokens: number;
  monthCompletionTokens: number;
  monthTokens: number;
  monthMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalMessages: number;
  /** null = unlimited. */
  monthlyTokenLimit: number | null;
  monthlyMessageLimit: number | null;
  aiBlocked: boolean;
  /** Messages left this month, or null when there is no message cap. */
  messagesLeft: number | null;
};

const EMPTY_SNAPSHOT: BusinessUsageSnapshot = {
  monthPromptTokens: 0,
  monthCompletionTokens: 0,
  monthTokens: 0,
  monthMessages: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  totalMessages: 0,
  monthlyTokenLimit: null,
  monthlyMessageLimit: null,
  aiBlocked: false,
  messagesLeft: null,
};

/**
 * One business's own monthly + all-time usage next to its caps. Powers the
 * sidebar quota indicator and the dashboard overview. Fails open with zeros so
 * a missing table never breaks the dashboard chrome.
 */
export const getBusinessUsageSnapshot = async (
  userId: string
): Promise<BusinessUsageSnapshot> => {
  type TotalsRow = {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    chat_count: number;
  };
  const firstRow = (value: unknown): TotalsRow | null => {
    const row = Array.isArray(value) ? value[0] : value;
    return (row as TotalsRow) ?? null;
  };

  try {
    const admin = createAdminClient();
    const [limitsRes, monthRes, totalRes] = await Promise.all([
      admin
        .from("ai_business_limits")
        .select("monthly_token_limit, monthly_message_limit, ai_blocked")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.rpc("ai_usage_totals", {
        for_user: userId,
        since: monthStartIso(),
      }),
      admin.rpc("ai_usage_totals", { for_user: userId, since: null }),
    ]);

    const month = firstRow(monthRes.data);
    const total = firstRow(totalRes.data);
    const limits = limitsRes.data;

    const monthlyMessageLimit =
      (limits?.monthly_message_limit as number | null | undefined) ?? null;
    const monthMessages = Number(month?.chat_count ?? 0);

    return {
      monthPromptTokens: Number(month?.prompt_tokens ?? 0),
      monthCompletionTokens: Number(month?.completion_tokens ?? 0),
      monthTokens: Number(month?.total_tokens ?? 0),
      monthMessages,
      totalPromptTokens: Number(total?.prompt_tokens ?? 0),
      totalCompletionTokens: Number(total?.completion_tokens ?? 0),
      totalTokens: Number(total?.total_tokens ?? 0),
      totalMessages: Number(total?.chat_count ?? 0),
      monthlyTokenLimit:
        (limits?.monthly_token_limit as number | null | undefined) ?? null,
      monthlyMessageLimit,
      aiBlocked: limits?.ai_blocked === true,
      messagesLeft:
        monthlyMessageLimit === null
          ? null
          : Math.max(0, monthlyMessageLimit - monthMessages),
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
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
