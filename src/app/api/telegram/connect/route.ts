import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptTelegramToken } from "@/lib/telegram/token-crypto";

export const runtime = "nodejs";

const TOKEN_RE = /^\d{6,20}:[A-Za-z0-9_-]{20,100}$/;
const MAX_BODY_BYTES = 512;
const TELEGRAM_TIMEOUT_MS = 8_000;

type TelegramBot = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

type TelegramResponse = {
  ok: boolean;
  result?: TelegramBot;
};

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.", 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("توکن واردشده معتبر نیست.", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return jsonError("توکن را دوباره وارد کنید.", 400);
  }

  if (!TOKEN_RE.test(token)) {
    return jsonError("توکن کامل BotFather را وارد کنید.", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  let telegramResponse: Response;

  try {
    telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/getMe`,
      {
        cache: "no-store",
        signal: controller.signal,
      }
    );
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("پاسخ تلگرام طول کشید؛ دوباره تلاش کنید.", 504);
    }
    return jsonError("ارتباط با تلگرام برقرار نشد؛ دوباره تلاش کنید.", 502);
  }
  clearTimeout(timeout);

  if (telegramResponse.status === 401 || telegramResponse.status === 404) {
    return jsonError("این توکن معتبر نیست؛ آن را دوباره از BotFather کپی کنید.", 400);
  }
  if (telegramResponse.status === 429) {
    return jsonError("درخواست‌ها زیاد شده؛ کمی بعد دوباره تلاش کنید.", 429);
  }
  if (!telegramResponse.ok) {
    return jsonError("تلگرام پاسخ نداد؛ چند لحظه بعد دوباره تلاش کنید.", 502);
  }

  let telegramData: TelegramResponse;
  try {
    telegramData = (await telegramResponse.json()) as TelegramResponse;
  } catch {
    return jsonError("پاسخ تلگرام قابل خواندن نبود؛ دوباره تلاش کنید.", 502);
  }

  const bot = telegramData.result;
  if (
    !telegramData.ok ||
    !bot?.is_bot ||
    !bot.username ||
    !bot.first_name
  ) {
    return jsonError("این توکن به یک ربات معتبر تلگرام تعلق ندارد.", 400);
  }

  let tokenCiphertext: string;
  try {
    tokenCiphertext = encryptTelegramToken(token);
  } catch {
    return jsonError("ذخیره امن توکن هنوز روی سرور تنظیم نشده است.", 500);
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("telegram_connections").upsert(
      {
        user_id: user.id,
        bot_id: String(bot.id),
        bot_name: bot.first_name,
        bot_username: bot.username,
        token_ciphertext: tokenCiphertext,
        status: "verified",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      const message =
        status === 409
          ? "این ربات از قبل به حساب دیگری متصل شده است."
          : "ربات پیدا شد، اما ذخیره اتصال انجام نشد؛ دوباره تلاش کنید.";
      return jsonError(message, status);
    }
  } catch {
    return jsonError("اتصال امن سرور هنوز کامل تنظیم نشده است.", 500);
  }

  return NextResponse.json({
    bot: {
      id: String(bot.id),
      name: bot.first_name,
      username: bot.username,
    },
  });
};
