import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  normalizeKeyword,
  toTelegramCommandKeyword,
  type AutomationTriggerType,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptTelegramToken } from "@/lib/telegram/token-crypto";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128_000;
const TELEGRAM_TIMEOUT_MS = 8_000;
const BOT_ID_RE = /^\d{1,24}$/;

type RouteContext = { params: { botId: string } };

type TelegramMessageEntity = {
  type?: string;
  offset?: number;
  length?: number;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    entities?: TelegramMessageEntity[];
    chat?: { id?: number };
    from?: { is_bot?: boolean };
  };
};

type ParsedCommand = {
  detected: boolean;
  keyword: string | null;
};

const parseTelegramCommand = ({
  botUsername,
  entities,
  text,
}: {
  botUsername: string;
  entities?: TelegramMessageEntity[];
  text: string;
}): ParsedCommand => {
  const commandEntity = entities?.find(
    (entity) =>
      entity.type === "bot_command" &&
      entity.offset === 0 &&
      typeof entity.length === "number" &&
      entity.length > 0
  );
  const fallbackMatch = commandEntity
    ? null
    : text.match(/^\/[a-zA-Z0-9_]{1,32}(?:@[a-zA-Z0-9_]{5,32})?(?=\s|$)/);
  const commandToken = commandEntity
    ? text.slice(0, commandEntity.length as number)
    : fallbackMatch?.[0];

  if (!commandToken) return { detected: false, keyword: null };

  const match = commandToken.match(
    /^\/([a-zA-Z0-9_]{1,32})(?:@([a-zA-Z0-9_]{5,32}))?$/
  );
  if (!match) return { detected: true, keyword: null };

  const targetUsername = match[2];
  if (
    targetUsername &&
    targetUsername.toLocaleLowerCase("en-US") !==
      botUsername.toLocaleLowerCase("en-US")
  ) {
    return { detected: true, keyword: null };
  }

  return {
    detected: true,
    keyword: toTelegramCommandKeyword(match[1]),
  };
};

const secretsMatch = (received: string | null, expected: string) => {
  if (!received || received.length > 256) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
};

const sendPreparedReply = async ({
  chatId,
  replyText,
  token,
}: {
  chatId: number;
  replyText: string;
  token: string;
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: replyText }),
        cache: "no-store",
        signal: controller.signal,
      }
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

export const POST = async (request: NextRequest, { params }: RouteContext) => {
  if (!BOT_ID_RE.test(params.botId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("telegram_connections")
    .select("id, bot_username, token_ciphertext, webhook_secret")
    .eq("bot_id", params.botId)
    .maybeSingle();

  if (connectionError || !connection?.webhook_secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    !secretsMatch(
      request.headers.get("x-telegram-bot-api-secret-token"),
      connection.webhook_secret
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const message = update.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (
    message?.from?.is_bot ||
    typeof text !== "string" ||
    typeof chatId !== "number"
  ) {
    return NextResponse.json({ ok: true });
  }

  const parsedCommand = parseTelegramCommand({
    botUsername: connection.bot_username,
    entities: message?.entities,
    text,
  });
  if (parsedCommand.detected && !parsedCommand.keyword) {
    return NextResponse.json({ ok: true });
  }

  const triggerType: AutomationTriggerType = parsedCommand.detected
    ? "command"
    : "keyword";
  const keywordNormalized = parsedCommand.keyword ?? normalizeKeyword(text);
  if (!keywordNormalized) {
    return NextResponse.json({ ok: true });
  }

  const { data: automation, error: automationError } = await admin
    .from("telegram_keyword_automations")
    .select("reply_text")
    .eq("telegram_connection_id", connection.id)
    .eq("trigger_type", triggerType)
    .eq("keyword_normalized", keywordNormalized)
    .eq("is_active", true)
    .maybeSingle();

  if (automationError) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
  if (!automation) {
    return NextResponse.json({ ok: true });
  }

  let token = "";
  try {
    token = decryptTelegramToken(connection.token_ciphertext);
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  const sent = await sendPreparedReply({
    chatId,
    replyText: automation.reply_text,
    token,
  });

  return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
};
