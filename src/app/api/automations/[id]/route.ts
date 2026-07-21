import { NextResponse, type NextRequest } from "next/server";
import {
  cleanKeyword,
  KEYWORD_MAX_LENGTH,
  normalizeKeyword,
  REPLY_MAX_LENGTH,
  type KeywordAutomation,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { activateTelegramWebhook } from "@/lib/telegram/webhook";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8_500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: { id: string } };

type AutomationRow = {
  id: string;
  telegram_connection_id: string;
  keyword: string;
  reply_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const toAutomation = (row: AutomationRow): KeywordAutomation => ({
  id: row.id,
  keyword: row.keyword,
  replyText: row.reply_text,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const authenticatedUser = async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

export const PATCH = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.", 403);
  }
  if (!UUID_RE.test(params.id)) {
    return jsonError("اتوماسیون موردنظر پیدا نشد.", 404);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("متن پاسخ طولانی‌تر از حد مجاز است.", 413);
  }

  const user = await authenticatedUser();
  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  let body: { keyword?: unknown; replyText?: unknown; isActive?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات اتوماسیون قابل خواندن نیست.", 400);
  }

  const hasKeyword = Object.prototype.hasOwnProperty.call(body, "keyword");
  const hasReply = Object.prototype.hasOwnProperty.call(body, "replyText");
  const hasActive = Object.prototype.hasOwnProperty.call(body, "isActive");

  if (!hasKeyword && !hasReply && !hasActive) {
    return jsonError("تغییری برای ذخیره وجود ندارد.", 400);
  }
  if (hasKeyword && typeof body.keyword !== "string") {
    return jsonError("کلیدواژه معتبر نیست.", 400);
  }
  if (hasReply && typeof body.replyText !== "string") {
    return jsonError("متن پاسخ معتبر نیست.", 400);
  }
  if (hasActive && typeof body.isActive !== "boolean") {
    return jsonError("وضعیت اتوماسیون معتبر نیست.", 400);
  }

  try {
    const admin = createAdminClient();
    const { data: existing, error: readError } = await admin
      .from("telegram_keyword_automations")
      .select(
        "id, telegram_connection_id, keyword, reply_text, is_active, created_at, updated_at"
      )
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      return jsonError("اتوماسیون بارگذاری نشد؛ دوباره تلاش کنید.", 500);
    }
    if (!existing) {
      return jsonError("اتوماسیون موردنظر پیدا نشد.", 404);
    }

    const keyword = hasKeyword
      ? cleanKeyword(body.keyword as string)
      : existing.keyword;
    const replyText = hasReply
      ? (body.replyText as string).trim()
      : existing.reply_text;
    const isActive = hasActive ? (body.isActive as boolean) : existing.is_active;

    if (!keyword || keyword.length > KEYWORD_MAX_LENGTH) {
      return jsonError("کلیدواژه باید بین ۱ تا ۸۰ نویسه باشد.", 400);
    }
    if (!replyText || replyText.length > REPLY_MAX_LENGTH) {
      return jsonError("متن پاسخ باید بین ۱ تا ۴۰۹۶ نویسه باشد.", 400);
    }

    const { data, error } = await admin
      .from("telegram_keyword_automations")
      .update({
        keyword,
        keyword_normalized: normalizeKeyword(keyword),
        reply_text: replyText,
        is_active: isActive,
      })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select(
        "id, telegram_connection_id, keyword, reply_text, is_active, created_at, updated_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return jsonError("برای این کلیدواژه قبلاً یک پاسخ ساخته‌اید.", 409);
      }
      return jsonError("تغییرات ذخیره نشد؛ دوباره تلاش کنید.", 500);
    }

    const webhookActive = isActive
      ? await activateTelegramWebhook({
          connectionId: data.telegram_connection_id,
          requestUrl: request.url,
          userId: user.id,
        })
      : true;

    return NextResponse.json({
      automation: toAutomation(data as AutomationRow),
      webhookActive,
    });
  } catch {
    return jsonError("تغییرات ذخیره نشد؛ دوباره تلاش کنید.", 500);
  }
};

export const DELETE = async (request: NextRequest, { params }: RouteContext) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.", 403);
  }
  if (!UUID_RE.test(params.id)) {
    return jsonError("اتوماسیون موردنظر پیدا نشد.", 404);
  }

  const user = await authenticatedUser();
  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("telegram_keyword_automations")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return jsonError("اتوماسیون حذف نشد؛ دوباره تلاش کنید.", 500);
    }
    if (!data) {
      return jsonError("اتوماسیون موردنظر پیدا نشد.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("اتوماسیون حذف نشد؛ دوباره تلاش کنید.", 500);
  }
};
