import { NextResponse, type NextRequest } from "next/server";
import { isTelegramAiConfigured } from "@/lib/ai/telegram-assistant";
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

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("وضعیت دستیار قابل خواندن نیست.", 400);
  }

  if (typeof body.enabled !== "boolean") {
    return jsonError("وضعیت دستیار معتبر نیست.", 400);
  }

  if (body.enabled && !isTelegramAiConfigured()) {
    return jsonError(
      "برای روشن کردن دستیار، ابتدا NVIDIA NIM یا OpenAI را در سرور تنظیم کنید.",
      409
    );
  }

  const { data, error } = await supabase
    .from("ai_assistant_settings")
    .upsert(
      { user_id: user.id, is_enabled: body.enabled },
      { onConflict: "user_id" }
    )
    .select("is_enabled")
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

  return NextResponse.json({ enabled: data.is_enabled });
};
