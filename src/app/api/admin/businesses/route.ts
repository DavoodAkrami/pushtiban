import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/auth/site-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "42883", "PGRST204", "PGRST205", "PGRST202"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const guardError = (status: 401 | 403) =>
  jsonError(
    status === 401
      ? "نشست شما تمام شده؛ دوباره وارد حساب شوید."
      : "دسترسی به این بخش مخصوص مدیر سایت است.",
    status
  );

export type AdminBusinessRow = {
  id: string;
  email: string;
  fullName: string;
  businessName: string;
  isAdmin: boolean;
  createdAt: string;
  aiEnabled: boolean;
  monthPromptTokens: number;
  monthCompletionTokens: number;
  monthTokens: number;
  monthMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalMessages: number;
  monthlyTokenLimit: number | null;
  monthlyMessageLimit: number | null;
  aiBlocked: boolean;
};

/** First instant of the current calendar month (UTC). */
const monthStartIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

/** GET — all businesses with their AI state, monthly/all-time usage, and limits. */
export const GET = async () => {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guardError(guard.status);

  const admin = createAdminClient();

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, full_name, business_name, is_admin, created_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    const setupRequired = SETUP_ERROR_CODES.has(profilesError.code ?? "");
    return jsonError(
      setupRequired
        ? "راه‌اندازی بخش مدیریت کامل نشده؛ اسکریپت admin.sql را اجرا کنید."
        : "فهرست کسب‌وکارها دریافت نشد؛ دوباره تلاش کنید.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  // Companion tables may not exist yet (admin.sql not run) — each read is
  // independent and simply contributes nothing when it fails.
  const [settingsRes, limitsRes, monthRes, totalRes] = await Promise.all([
    admin.from("ai_assistant_settings").select("user_id, is_enabled"),
    admin
      .from("ai_business_limits")
      .select("user_id, monthly_token_limit, monthly_message_limit, ai_blocked"),
    admin.rpc("ai_usage_summary", { since: monthStartIso() }),
    admin.rpc("ai_usage_summary", { since: null }),
  ]);

  const settingsByUser = new Map<string, boolean>();
  for (const row of settingsRes.data ?? []) {
    settingsByUser.set(row.user_id as string, row.is_enabled === true);
  }

  const limitsByUser = new Map<
    string,
    { tokenLimit: number | null; messageLimit: number | null; blocked: boolean }
  >();
  for (const row of limitsRes.data ?? []) {
    limitsByUser.set(row.user_id as string, {
      tokenLimit: row.monthly_token_limit as number | null,
      messageLimit: row.monthly_message_limit as number | null,
      blocked: row.ai_blocked === true,
    });
  }

  type UsageRow = {
    user_id: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    chat_count: number;
  };
  const monthByUser = new Map<string, UsageRow>();
  for (const row of (monthRes.data ?? []) as UsageRow[]) {
    monthByUser.set(row.user_id, row);
  }
  const totalByUser = new Map<string, UsageRow>();
  for (const row of (totalRes.data ?? []) as UsageRow[]) {
    totalByUser.set(row.user_id, row);
  }

  const businesses: AdminBusinessRow[] = (profiles ?? []).map((profile) => {
    const limits = limitsByUser.get(profile.id as string);
    const month = monthByUser.get(profile.id as string);
    const total = totalByUser.get(profile.id as string);
    return {
      id: profile.id as string,
      email: (profile.email as string) ?? "",
      fullName: (profile.full_name as string) ?? "",
      businessName: (profile.business_name as string) ?? "",
      isAdmin: profile.is_admin === true,
      createdAt: (profile.created_at as string) ?? "",
      aiEnabled: settingsByUser.get(profile.id as string) ?? false,
      monthPromptTokens: Number(month?.prompt_tokens ?? 0),
      monthCompletionTokens: Number(month?.completion_tokens ?? 0),
      monthTokens: Number(month?.total_tokens ?? 0),
      monthMessages: Number(month?.chat_count ?? 0),
      totalPromptTokens: Number(total?.prompt_tokens ?? 0),
      totalCompletionTokens: Number(total?.completion_tokens ?? 0),
      totalTokens: Number(total?.total_tokens ?? 0),
      totalMessages: Number(total?.chat_count ?? 0),
      monthlyTokenLimit: limits?.tokenLimit ?? null,
      monthlyMessageLimit: limits?.messageLimit ?? null,
      aiBlocked: limits?.blocked ?? false,
    };
  });

  const sum = (pick: (row: AdminBusinessRow) => number) =>
    businesses.reduce((carry, row) => carry + pick(row), 0);

  return NextResponse.json({
    businesses,
    totals: {
      monthPromptTokens: sum((b) => b.monthPromptTokens),
      monthCompletionTokens: sum((b) => b.monthCompletionTokens),
      monthTokens: sum((b) => b.monthTokens),
      monthMessages: sum((b) => b.monthMessages),
      totalPromptTokens: sum((b) => b.totalPromptTokens),
      totalCompletionTokens: sum((b) => b.totalCompletionTokens),
      totalTokens: sum((b) => b.totalTokens),
      totalMessages: sum((b) => b.totalMessages),
    },
  });
};

type LimitsBody = {
  userId?: unknown;
  monthlyTokenLimit?: unknown;
  monthlyMessageLimit?: unknown;
  aiBlocked?: unknown;
};

/** Parse a limit value: null clears it, a non-negative integer sets it. */
const parseLimit = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return undefined;
};

/** PUT — upsert one business's limits / block switch. */
export const PUT = async (request: Request) => {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guardError(guard.status);

  let body: LimitsBody;
  try {
    body = (await request.json()) as LimitsBody;
  } catch {
    return jsonError("درخواست قابل خواندن نیست.", 400);
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return jsonError("شناسه کسب‌وکار معتبر نیست.", 400);

  const update: {
    user_id: string;
    monthly_token_limit?: number | null;
    monthly_message_limit?: number | null;
    ai_blocked?: boolean;
  } = { user_id: userId };

  if ("monthlyTokenLimit" in body) {
    const parsed = parseLimit(body.monthlyTokenLimit);
    if (parsed === undefined) return jsonError("سقف توکن معتبر نیست.", 400);
    update.monthly_token_limit = parsed;
  }
  if ("monthlyMessageLimit" in body) {
    const parsed = parseLimit(body.monthlyMessageLimit);
    if (parsed === undefined) return jsonError("سقف پیام معتبر نیست.", 400);
    update.monthly_message_limit = parsed;
  }
  if ("aiBlocked" in body) {
    if (typeof body.aiBlocked !== "boolean") {
      return jsonError("وضعیت مسدودسازی معتبر نیست.", 400);
    }
    update.ai_blocked = body.aiBlocked;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_business_limits")
    .upsert(update, { onConflict: "user_id" })
    .select("user_id, monthly_token_limit, monthly_message_limit, ai_blocked")
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code ?? "");
    return jsonError(
      setupRequired
        ? "راه‌اندازی بخش مدیریت کامل نشده؛ اسکریپت admin.sql را اجرا کنید."
        : "ذخیره محدودیت‌ها ناموفق بود؛ دوباره تلاش کنید.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({
    limits: {
      userId: data.user_id,
      monthlyTokenLimit: data.monthly_token_limit,
      monthlyMessageLimit: data.monthly_message_limit,
      aiBlocked: data.ai_blocked,
    },
  });
};
