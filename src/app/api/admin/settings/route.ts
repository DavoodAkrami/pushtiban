import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/auth/site-admin";
import {
  DEFAULT_GLOBAL_AI_SETTINGS,
  invalidateGlobalAiSettingsCache,
} from "@/lib/ai/usage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const guardError = (status: 401 | 403) =>
  jsonError(
    status === 401
      ? "نشست شما تمام شده؛ دوباره وارد حساب شوید."
      : "دسترسی به این بخش مخصوص مدیر سایت است.",
    status
  );

type SettingsRow = {
  ai_enabled: boolean;
  qa_min_similarity: number;
  chunk_min_similarity: number;
  chunk_match_count: number;
  qa_match_count: number;
  intent_enabled: boolean;
};

const toResponse = (row: SettingsRow) => ({
  settings: {
    aiEnabled: row.ai_enabled,
    qaMinSimilarity: row.qa_min_similarity,
    chunkMinSimilarity: row.chunk_min_similarity,
    chunkMatchCount: row.chunk_match_count,
    qaMatchCount: row.qa_match_count,
    intentEnabled: row.intent_enabled,
  },
});

const SELECT_COLUMNS =
  "ai_enabled, qa_min_similarity, chunk_min_similarity, chunk_match_count, qa_match_count, intent_enabled";

/** GET — current global AI settings (defaults when the table is missing). */
export const GET = async () => {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guardError(guard.status);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_global_settings")
    .select(SELECT_COLUMNS)
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code ?? "");
    if (setupRequired) {
      return NextResponse.json({
        settings: DEFAULT_GLOBAL_AI_SETTINGS,
        setupRequired: true,
      });
    }
    return jsonError("تنظیمات دریافت نشد؛ دوباره تلاش کنید.", 500);
  }

  if (!data) {
    return NextResponse.json({ settings: DEFAULT_GLOBAL_AI_SETTINGS });
  }
  return NextResponse.json(toResponse(data as SettingsRow));
};

type SettingsBody = {
  aiEnabled?: unknown;
  qaMinSimilarity?: unknown;
  chunkMinSimilarity?: unknown;
  chunkMatchCount?: unknown;
  qaMatchCount?: unknown;
  intentEnabled?: unknown;
};

const parseRatio = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;

const parseCount = (value: unknown, max: number): number | undefined =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= max
    ? value
    : undefined;

/** PUT — partial update of the singleton settings row. */
export const PUT = async (request: Request) => {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guardError(guard.status);

  let body: SettingsBody;
  try {
    body = (await request.json()) as SettingsBody;
  } catch {
    return jsonError("درخواست قابل خواندن نیست.", 400);
  }

  const update: Record<string, number | boolean> = {};
  if ("aiEnabled" in body) {
    if (typeof body.aiEnabled !== "boolean") return jsonError("مقدار کلید هوش مصنوعی معتبر نیست.", 400);
    update.ai_enabled = body.aiEnabled;
  }
  if ("intentEnabled" in body) {
    if (typeof body.intentEnabled !== "boolean") return jsonError("مقدار تشخیص موضوع معتبر نیست.", 400);
    update.intent_enabled = body.intentEnabled;
  }
  if ("qaMinSimilarity" in body) {
    const parsed = parseRatio(body.qaMinSimilarity);
    if (parsed === undefined) return jsonError("آستانه شباهت پرسش‌وپاسخ باید بین ۰ و ۱ باشد.", 400);
    update.qa_min_similarity = parsed;
  }
  if ("chunkMinSimilarity" in body) {
    const parsed = parseRatio(body.chunkMinSimilarity);
    if (parsed === undefined) return jsonError("آستانه شباهت دانش باید بین ۰ و ۱ باشد.", 400);
    update.chunk_min_similarity = parsed;
  }
  if ("chunkMatchCount" in body) {
    const parsed = parseCount(body.chunkMatchCount, 10);
    if (parsed === undefined) return jsonError("تعداد قطعه دانش باید بین ۱ و ۱۰ باشد.", 400);
    update.chunk_match_count = parsed;
  }
  if ("qaMatchCount" in body) {
    const parsed = parseCount(body.qaMatchCount, 5);
    if (parsed === undefined) return jsonError("تعداد پرسش‌وپاسخ باید بین ۱ و ۵ باشد.", 400);
    update.qa_match_count = parsed;
  }

  if (!Object.keys(update).length) {
    return jsonError("هیچ تنظیمی برای ذخیره ارسال نشده است.", 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_global_settings")
    .upsert({ id: 1, ...update }, { onConflict: "id" })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code ?? "");
    return jsonError(
      setupRequired
        ? "راه‌اندازی بخش مدیریت کامل نشده؛ اسکریپت admin.sql را اجرا کنید."
        : "ذخیره تنظیمات ناموفق بود؛ دوباره تلاش کنید.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  invalidateGlobalAiSettingsCache();
  return NextResponse.json(toResponse(data as SettingsRow));
};
