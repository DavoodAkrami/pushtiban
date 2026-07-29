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
  FLOW_NODE_MESSAGE_MAX_LENGTH,
  type AutomationFlow,
} from "@/lib/flows";
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
  triggerType: row.trigger_type,
  triggerKeyword: row.trigger_keyword,
  name: row.name,
  commandDescription: row.command_description,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const GET = async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  try {
    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("telegram_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) return jsonError("اطلاعات ربات بارگذاری نشد.", 500);
    if (!connection) return NextResponse.json({ flows: [] });

    const { data, error } = await admin
      .from("automation_flows")
      .select("id, trigger_type, trigger_keyword, name, command_description, is_active, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("telegram_connection_id", connection.id)
      .order("created_at", { ascending: false });

    if (error) {
      const setupRequired = SETUP_ERROR_CODES.has(error.code);
      return jsonError(
        setupRequired ? "راه‌اندازی فلوها هنوز کامل نشده؛ اسکریپت پایگاه داده را اجرا کنید." : "فلوها بارگذاری نشدند.",
        setupRequired ? 503 : 500,
        setupRequired
      );
    }

    return NextResponse.json({ flows: (data as FlowRow[]).map(toFlow) });
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

  let body: { triggerType?: unknown; triggerKeyword?: unknown; name?: unknown; commandDescription?: unknown; rootMessage?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  if (typeof body.triggerKeyword !== "string" || typeof body.name !== "string" || typeof body.rootMessage !== "string") {
    return jsonError("اطلاعات ناقص است.", 400);
  }

  const triggerType: AutomationTriggerType = body.triggerType === "command" ? "command" : "keyword";
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
  if (!rootMessage || rootMessage.length > FLOW_NODE_MESSAGE_MAX_LENGTH)
    return jsonError("متن پیام اول باید بین ۱ تا ۴۰۹۶ نویسه باشد.", 400);

  try {
    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("telegram_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) return jsonError("اطلاعات ربات بررسی نشد.", 500);
    if (!connection) return jsonError("ابتدا ربات تلگرام را متصل کنید.", 409);

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
        telegram_connection_id: connection.id,
        trigger_type: triggerType,
        trigger_keyword: triggerKeyword,
        trigger_keyword_normalized: triggerKeywordNormalized,
        name,
        command_description: commandDescription,
      })
      .select("id, trigger_type, trigger_keyword, name, command_description, is_active, created_at, updated_at")
      .single();

    if (flowError) {
      if (flowError.code === "23505") return jsonError("برای این کلیدواژه قبلاً یک فلو ساخته‌اید.", 409);
      const setupRequired = SETUP_ERROR_CODES.has(flowError.code);
      return jsonError(
        setupRequired ? "راه‌اندازی فلوها هنوز کامل نشده؛ اسکریپت پایگاه داده را اجرا کنید." : "فلو ذخیره نشد.",
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
      activateTelegramWebhook({ connectionId: connection.id, requestUrl: request.url, userId: user.id }),
      triggerType === "command"
        ? syncTelegramCommandMenu({ connectionId: connection.id, userId: user.id })
        : Promise.resolve(true),
    ]);

    return NextResponse.json({ flow: toFlow(flow as FlowRow), webhookActive, commandsSynced }, { status: 201 });
  } catch {
    return jsonError("فلو ذخیره نشد.", 500);
  }
};
