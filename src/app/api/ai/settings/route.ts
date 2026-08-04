import { NextResponse, type NextRequest } from "next/server";
import { isAssistantAiConfigured } from "@/lib/ai/assistant";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_024;
const SETUP_ERROR_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);

const jsonError = (
  error: string,
  status: number,
  setupRequired = false
) => NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError(
      "درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.",
      403
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("درخواست بزرگ‌تر از حد مجاز است.", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  let body: {
    enabled?: unknown;
    humanHandoff?: unknown;
    telegramEnabled?: unknown;
    instagramEnabled?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("وضعیت دستیار قابل خواندن نیست.", 400);
  }

  const hasEnabled = typeof body.enabled === "boolean";
  const hasHandoff = typeof body.humanHandoff === "boolean";
  const hasTelegram = typeof body.telegramEnabled === "boolean";
  const hasInstagram = typeof body.instagramEnabled === "boolean";
  if (!hasEnabled && !hasHandoff && !hasTelegram && !hasInstagram) {
    return jsonError("وضعیت دستیار معتبر نیست.", 400);
  }

  // Turning the assistant ON requires a configured provider; the handoff
  // toggle has no such requirement (it only routes to humans).
  if (hasEnabled && body.enabled === true && !isAssistantAiConfigured()) {
    return jsonError(
      "برای روشن کردن دستیار، ابتدا NVIDIA NIM یا OpenAI را در سرور تنظیم کنید.",
      409
    );
  }

  // The per-channel switches sit under is_enabled: the master toggle decides
  // whether the assistant runs at all, these decide where it answers.
  const update: {
    user_id: string;
    is_enabled?: boolean;
    human_handoff_enabled?: boolean;
    telegram_enabled?: boolean;
    instagram_enabled?: boolean;
  } = { user_id: user.id };
  if (hasEnabled) update.is_enabled = body.enabled as boolean;
  if (hasHandoff) update.human_handoff_enabled = body.humanHandoff as boolean;
  if (hasTelegram) update.telegram_enabled = body.telegramEnabled as boolean;
  if (hasInstagram) update.instagram_enabled = body.instagramEnabled as boolean;

  const { data, error } = await supabase
    .from("ai_assistant_settings")
    .upsert(update, { onConflict: "user_id" })
    .select(
      "is_enabled, human_handoff_enabled, telegram_enabled, instagram_enabled"
    )
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی دستیار کامل نشده است؛ اسکریپت پایگاه داده را اجرا کنید."
        : "وضعیت دستیار ذخیره نشد؛ دوباره تلاش کنید.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({
    enabled: data.is_enabled,
    humanHandoff: data.human_handoff_enabled,
    // Absent columns mean channel-inbox.sql has not run; the migration defaults
    // both to true, so reading them that way keeps the UI honest either way.
    telegramEnabled: data.telegram_enabled ?? true,
    instagramEnabled: data.instagram_enabled ?? true,
  });
};
