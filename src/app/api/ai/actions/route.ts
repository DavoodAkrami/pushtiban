import { NextResponse, type NextRequest } from "next/server";
import {
  ACTION_REGISTRY,
  listSafeActionSettings,
} from "@/lib/ai/actions/registry";
import { isActionSettingsSetupError } from "@/lib/ai/actions/settings";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_024;

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

/** GET /api/ai/actions — sanitized registry metadata for the signed-in owner. */
export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  try {
    return NextResponse.json({ actions: await listSafeActionSettings(user.id) });
  } catch {
    return jsonError("تنظیمات اقدامات بارگذاری نشد.", 500);
  }
};

/** PUT /api/ai/actions — update one explicit, registry-known action only. */
export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError(
      "درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.",
      403
    );
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonError("درخواست بزرگ‌تر از حد مجاز است.", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("تنظیمات اقدام قابل خواندن نیست.", 400);
  }

  if (
    typeof body.actionKey !== "string" ||
    !ACTION_REGISTRY.has(body.actionKey) ||
    typeof body.enabled !== "boolean" ||
    (body.requireConfirmation !== undefined &&
      typeof body.requireConfirmation !== "boolean")
  ) {
    return jsonError("تنظیمات اقدام معتبر نیست.", 400);
  }

  const { error } = await supabase.from("business_action_settings").upsert(
    {
      user_id: user.id,
      action_key: body.actionKey,
      is_enabled: body.enabled,
      require_confirmation: body.requireConfirmation === true,
    },
    { onConflict: "user_id,action_key" }
  );

  if (error) {
    const setupRequired = isActionSettingsSetupError(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی اقدامات کامل نشده؛ اسکریپت ai-actions.sql را اجرا کنید."
        : "تنظیمات اقدام ذخیره نشد؛ دوباره تلاش کنید.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  const actions = await listSafeActionSettings(user.id);
  const action = actions.find((item) => item.key === body.actionKey);
  return action
    ? NextResponse.json({ action })
    : jsonError("تنظیمات اقدام قابل خواندن نیست.", 500);
};
