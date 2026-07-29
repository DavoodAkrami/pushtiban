import { NextResponse, type NextRequest } from "next/server";
import {
  cleanKeyword,
  isValidTelegramCommand,
  KEYWORD_MAX_LENGTH,
  normalizeKeyword,
  REPLY_MAX_LENGTH,
  TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH,
  TELEGRAM_COMMANDS_MAX_COUNT,
  toTelegramCommandKeyword,
  type AutomationTriggerType,
  type KeywordAutomation,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  activateTelegramWebhook,
  syncTelegramCommandMenu,
} from "@/lib/telegram/webhook";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8_500;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

type AutomationRow = {
  id: string;
  trigger_type: AutomationTriggerType;
  keyword: string;
  command_description: string | null;
  reply_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const toAutomation = (row: AutomationRow): KeywordAutomation => ({
  id: row.id,
  triggerType: row.trigger_type,
  keyword: row.keyword,
  commandDescription: row.command_description,
  replyText: row.reply_text,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const jsonError = (
  error: string,
  status: number,
  setupRequired = false
) => NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const setupMessage =
  "راه‌اندازی اتوماسیون هنوز کامل نشده است؛ اسکریپت پایگاه داده را اجرا کنید.";

export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  try {
    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("telegram_connections")
      .select("id, bot_id, bot_name, bot_username, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) {
      return jsonError("اطلاعات ربات بارگذاری نشد؛ دوباره تلاش کنید.", 500);
    }

    if (!connection) {
      return NextResponse.json({ automations: [], bot: null });
    }

    const { data, error } = await admin
      .from("telegram_keyword_automations")
      .select(
        "id, trigger_type, keyword, command_description, reply_text, is_active, created_at, updated_at"
      )
      .eq("user_id", user.id)
      .eq("telegram_connection_id", connection.id)
      .order("created_at", { ascending: false });

    if (error) {
      const setupRequired = SETUP_ERROR_CODES.has(error.code);
      return jsonError(
        setupRequired
          ? setupMessage
          : "اتوماسیون‌ها بارگذاری نشدند؛ دوباره تلاش کنید.",
        setupRequired ? 503 : 500,
        setupRequired
      );
    }

    return NextResponse.json({
      automations: (data as AutomationRow[]).map(toAutomation),
      bot: {
        id: connection.bot_id,
        name: connection.bot_name,
        username: connection.bot_username,
        status: connection.status,
      },
    });
  } catch {
    return jsonError("اتوماسیون‌ها بارگذاری نشدند؛ دوباره تلاش کنید.", 500);
  }
};

export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.", 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("متن پاسخ طولانی‌تر از حد مجاز است.", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  let body: {
    triggerType?: unknown;
    keyword?: unknown;
    commandDescription?: unknown;
    replyText?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات اتوماسیون قابل خواندن نیست.", 400);
  }

  if (typeof body.keyword !== "string" || typeof body.replyText !== "string") {
    return jsonError("کلیدواژه و متن پاسخ را کامل کنید.", 400);
  }

  const triggerType: AutomationTriggerType =
    body.triggerType === undefined
      ? "keyword"
      : (body.triggerType as AutomationTriggerType);
  if (triggerType !== "keyword" && triggerType !== "command") {
    return jsonError("نوع محرک معتبر نیست.", 400);
  }

  const keyword =
    triggerType === "command"
      ? toTelegramCommandKeyword(body.keyword)
      : cleanKeyword(body.keyword);
  const keywordNormalized = normalizeKeyword(keyword);
  const commandDescription =
    triggerType === "command" && typeof body.commandDescription === "string"
      ? body.commandDescription.trim()
      : null;
  const replyText = body.replyText.trim();

  if (
    triggerType === "keyword" &&
    (!keyword || keyword.length > KEYWORD_MAX_LENGTH)
  ) {
    return jsonError("کلیدواژه باید بین ۱ تا ۸۰ نویسه باشد.", 400);
  }
  if (triggerType === "command" && !isValidTelegramCommand(keyword)) {
    return jsonError(
      "فرمان باید حداکثر ۳۲ نویسه و فقط شامل حروف انگلیسی، عدد یا زیرخط باشد.",
      400
    );
  }
  if (
    triggerType === "command" &&
    (!commandDescription ||
      commandDescription.length > TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH)
  ) {
    return jsonError("توضیح منوی فرمان باید بین ۱ تا ۲۵۶ نویسه باشد.", 400);
  }
  if (!replyText || replyText.length > REPLY_MAX_LENGTH) {
    return jsonError("متن پاسخ باید بین ۱ تا ۴۰۹۶ نویسه باشد.", 400);
  }

  try {
    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("telegram_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) {
      return jsonError("اطلاعات ربات بررسی نشد؛ دوباره تلاش کنید.", 500);
    }
    if (!connection) {
      return jsonError("ابتدا ربات تلگرام را از تنظیمات حساب متصل کنید.", 409);
    }

    if (triggerType === "command") {
      const { count, error: countError } = await admin
        .from("telegram_keyword_automations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("telegram_connection_id", connection.id)
        .eq("trigger_type", "command")
        .eq("is_active", true);

      if (countError) {
        return jsonError("فرمان‌های ربات بررسی نشدند؛ دوباره تلاش کنید.", 500);
      }
      if ((count ?? 0) >= TELEGRAM_COMMANDS_MAX_COUNT) {
        return jsonError("هر ربات حداکثر ۱۰۰ فرمان فعال می‌تواند داشته باشد.", 409);
      }
    }

    const { data, error } = await admin
      .from("telegram_keyword_automations")
      .insert({
        user_id: user.id,
        telegram_connection_id: connection.id,
        trigger_type: triggerType,
        keyword,
        keyword_normalized: keywordNormalized,
        command_description: commandDescription,
        reply_text: replyText,
      })
      .select(
        "id, trigger_type, keyword, command_description, reply_text, is_active, created_at, updated_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return jsonError("برای این کلیدواژه قبلاً یک پاسخ ساخته‌اید.", 409);
      }
      const setupRequired = SETUP_ERROR_CODES.has(error.code);
      return jsonError(
        setupRequired ? setupMessage : "اتوماسیون ذخیره نشد؛ دوباره تلاش کنید.",
        setupRequired ? 503 : 500,
        setupRequired
      );
    }

    const [webhookActive, commandsSynced] = await Promise.all([
      activateTelegramWebhook({
        connectionId: connection.id,
        requestUrl: request.url,
        userId: user.id,
      }),
      triggerType === "command"
        ? syncTelegramCommandMenu({
            connectionId: connection.id,
            userId: user.id,
          })
        : Promise.resolve(true),
    ]);

    return NextResponse.json(
      {
        automation: toAutomation(data as AutomationRow),
        webhookActive,
        commandsSynced,
      },
      { status: 201 }
    );
  } catch {
    return jsonError("اتوماسیون ذخیره نشد؛ دوباره تلاش کنید.", 500);
  }
};
