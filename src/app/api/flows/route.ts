import { NextResponse, type NextRequest } from "next/server";
import {
  cleanKeyword,
  isValidTelegramCommand,
  KEYWORD_MAX_LENGTH,
  normalizeKeyword,
  TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH,
  TELEGRAM_COMMANDS_MAX_COUNT,
  toTelegramCommandKeyword,
  type AutomationTriggerType,
} from "@/lib/automations";
import {
  FLOW_NAME_MAX_LENGTH,
  flowConnectionColumn,
  flowLimits,
  isFlowChannel,
  type AutomationFlow,
  type FlowChannel,
} from "@/lib/flows";
import { activateInstagramWebhook } from "@/lib/instagram/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  activateTelegramWebhook,
  syncTelegramCommandMenu,
} from "@/lib/telegram/webhook";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 10_000;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

type FlowRow = {
  id: string;
  channel: FlowChannel | null;
  trigger_type: AutomationTriggerType;
  trigger_keyword: string;
  name: string;
  command_description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const toFlow = (row: FlowRow): AutomationFlow => ({
  id: row.id,
  // An absent column means instagram-flows.sql has not run yet; the migration
  // backfills every existing row to telegram, so reading it that way keeps the
  // list honest either way.
  channel: row.channel ?? "telegram",
  triggerType: row.trigger_type,
  triggerKeyword: row.trigger_keyword,
  name: row.name,
  commandDescription: row.command_description,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const FLOW_COLUMNS =
  "id, channel, trigger_type, trigger_keyword, name, command_description, is_active, created_at, updated_at";

/**
 * The caller's connection on one channel, or null when they have not connected
 * it. Never trusts a connection id from the browser — it is always looked up
 * from the session's user id, the pattern every route in this repo follows.
 */
const findConnection = async (
  admin: ReturnType<typeof createAdminClient>,
  channel: FlowChannel,
  userId: string
) => {
  const table =
    channel === "instagram" ? "instagram_connections" : "telegram_connections";
  const { data, error } = await admin
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return { error, id: (data as { id: string } | null)?.id ?? null };
};

const readChannel = (value: unknown): FlowChannel =>
  isFlowChannel(value) ? value : "telegram";

export const GET = async (request: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  const channel = readChannel(request.nextUrl.searchParams.get("channel"));

  try {
    const admin = createAdminClient();
    const connection = await findConnection(admin, channel, user.id);

    if (connection.error) {
      return jsonError(
        channel === "instagram"
          ? "اطلاعات اینستاگرام بارگذاری نشد."
          : "اطلاعات ربات بارگذاری نشد.",
        500
      );
    }
    if (!connection.id) return NextResponse.json({ channel, flows: [] });

    const { data, error } = await admin
      .from("automation_flows")
      .select(FLOW_COLUMNS)
      .eq("user_id", user.id)
      .eq(flowConnectionColumn(channel), connection.id)
      .order("created_at", { ascending: false });

    if (error) {
      const setupRequired = SETUP_ERROR_CODES.has(error.code);
      return jsonError(
        setupRequired ? "راه‌اندازی فلوها هنوز کامل نشده؛ اسکریپت پایگاه داده را اجرا کنید." : "فلوها بارگذاری نشدند.",
        setupRequired ? 503 : 500,
        setupRequired
      );
    }

    return NextResponse.json({
      channel,
      flows: (data as FlowRow[]).map(toFlow),
    });
  } catch {
    return jsonError("فلوها بارگذاری نشدند.", 500);
  }
};

export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError("داده‌های ارسالی بیش از حد مجاز است.", 413);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  let body: { channel?: unknown; triggerType?: unknown; triggerKeyword?: unknown; name?: unknown; commandDescription?: unknown; rootMessage?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  if (typeof body.triggerKeyword !== "string" || typeof body.name !== "string" || typeof body.rootMessage !== "string") {
    return jsonError("اطلاعات ناقص است.", 400);
  }

  const channel = readChannel(body.channel);
  const limits = flowLimits(channel);

  // Instagram has no command menu and no way for a customer to type a slash
  // command, so a command trigger there is not a smaller feature — it is one
  // that could never fire.
  const triggerType: AutomationTriggerType =
    body.triggerType === "command" && limits.supportsCommands
      ? "command"
      : "keyword";
  const triggerKeyword = triggerType === "command"
    ? toTelegramCommandKeyword(body.triggerKeyword)
    : cleanKeyword(body.triggerKeyword);
  const triggerKeywordNormalized = normalizeKeyword(triggerKeyword);
  const name = body.name.trim();
  const commandDescription = triggerType === "command" && typeof body.commandDescription === "string"
    ? body.commandDescription.trim() : null;
  const rootMessage = body.rootMessage.trim();

  if (triggerType === "keyword" && (!triggerKeyword || triggerKeyword.length > KEYWORD_MAX_LENGTH))
    return jsonError("کلیدواژه باید بین ۱ تا ۸۰ نویسه باشد.", 400);
  if (triggerType === "command" && !isValidTelegramCommand(triggerKeyword))
    return jsonError("فرمان باید حداکثر ۳۲ نویسه و فقط شامل حروف انگلیسی، عدد یا زیرخط باشد.", 400);
  if (triggerType === "command" && (!commandDescription || commandDescription.length > TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH))
    return jsonError("توضیح منوی فرمان باید بین ۱ تا ۲۵۶ نویسه باشد.", 400);
  if (!name || name.length > FLOW_NAME_MAX_LENGTH)
    return jsonError("نام فلو باید بین ۱ تا ۱۰۰ نویسه باشد.", 400);
  if (!rootMessage || rootMessage.length > limits.messageMaxLength)
    return jsonError(
      channel === "instagram"
        ? "متن پیام اول باید بین ۱ تا ۶۴۰ نویسه باشد."
        : "متن پیام اول باید بین ۱ تا ۴۰۹۶ نویسه باشد.",
      400
    );

  try {
    const admin = createAdminClient();
    const connection = await findConnection(admin, channel, user.id);

    if (connection.error)
      return jsonError(
        channel === "instagram"
          ? "اتصال اینستاگرام بررسی نشد."
          : "اطلاعات ربات بررسی نشد.",
        500
      );
    if (!connection.id)
      return jsonError(
        channel === "instagram"
          ? "ابتدا حساب اینستاگرام را متصل کنید."
          : "ابتدا ربات تلگرام را متصل کنید.",
        409
      );

    if (triggerType === "command") {
      const { count, error: countError } = await admin
        .from("automation_flows")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("telegram_connection_id", connection.id)
        .eq("trigger_type", "command")
        .eq("is_active", true);
      if (countError) return jsonError("فرمان‌های ربات بررسی نشدند.", 500);
      if ((count ?? 0) >= TELEGRAM_COMMANDS_MAX_COUNT)
        return jsonError("هر ربات حداکثر ۱۰۰ فرمان فعال می‌تواند داشته باشد.", 409);
    }

    const { data: flow, error: flowError } = await admin
      .from("automation_flows")
      .insert({
        user_id: user.id,
        channel,
        [flowConnectionColumn(channel)]: connection.id,
        trigger_type: triggerType,
        trigger_keyword: triggerKeyword,
        trigger_keyword_normalized: triggerKeywordNormalized,
        name,
        command_description: commandDescription,
      })
      .select(FLOW_COLUMNS)
      .single();

    if (flowError) {
      if (flowError.code === "23505") return jsonError("برای این کلیدواژه قبلاً یک فلو ساخته‌اید.", 409);
      const setupRequired = SETUP_ERROR_CODES.has(flowError.code);
      return jsonError(
        setupRequired
          ? channel === "instagram"
            ? "راه‌اندازی فلوهای اینستاگرام کامل نشده؛ اسکریپت instagram-flows.sql را اجرا کنید."
            : "راه‌اندازی فلوها هنوز کامل نشده؛ اسکریپت پایگاه داده را اجرا کنید."
          : "فلو ذخیره نشد.",
        setupRequired ? 503 : 500,
        setupRequired
      );
    }

    const { error: nodeError } = await admin
      .from("automation_flow_nodes")
      .insert({ flow_id: flow.id, user_id: user.id, message_text: rootMessage, is_root: true });

    if (nodeError) {
      await admin.from("automation_flows").delete().eq("id", flow.id);
      return jsonError("فلو ذخیره نشد.", 500);
    }

    const [webhookActive, commandsSynced] = await Promise.all([
      channel === "instagram"
        ? activateInstagramWebhook({ connectionId: connection.id, userId: user.id })
        : activateTelegramWebhook({ connectionId: connection.id, requestUrl: request.url, userId: user.id }),
      triggerType === "command"
        ? syncTelegramCommandMenu({ connectionId: connection.id, userId: user.id })
        : Promise.resolve(true),
    ]);

    return NextResponse.json({ flow: toFlow(flow as FlowRow), webhookActive, commandsSynced }, { status: 201 });
  } catch {
    return jsonError("فلو ذخیره نشد.", 500);
  }
};
