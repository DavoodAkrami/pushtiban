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
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number } };
    from?: { is_bot?: boolean };
  };
};

type ParsedCommand = { detected: boolean; keyword: string | null };

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
    (e) =>
      e.type === "bot_command" &&
      e.offset === 0 &&
      typeof e.length === "number" &&
      e.length > 0
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

  return { detected: true, keyword: toTelegramCommandKeyword(match[1]) };
};

const secretsMatch = (received: string | null, expected: string) => {
  if (!received || received.length > 256) return false;
  const r = Buffer.from(received);
  const e = Buffer.from(expected);
  return r.length === e.length && timingSafeEqual(r, e);
};

const telegramPost = async (
  token: string,
  method: string,
  body: object
): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      }
    );
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

type ButtonRow = {
  id: string;
  label: string;
  action_type: "node" | "url" | "end";
  next_node_id: string | null;
  url: string | null;
  position: number;
};

type NodeRow = {
  id: string;
  message_text: string;
  automation_flow_buttons: ButtonRow[];
};

const FLOW_NODE_SELECT = `
  id, message_text,
  automation_flow_buttons:automation_flow_buttons!automation_flow_buttons_node_id_fkey (
    id, label, action_type, next_node_id, url, position
  )
`;

const buildInlineKeyboard = (buttons: ButtonRow[]) => {
  const sorted = [...buttons].sort((a, b) => a.position - b.position);
  const rows: { text: string; callback_data?: string; url?: string }[][] = [];
  for (const btn of sorted) {
    if (btn.action_type === "url" && btn.url) {
      rows.push([{ text: btn.label, url: btn.url }]);
    } else if (btn.action_type === "node" && btn.next_node_id) {
      rows.push([{ text: btn.label, callback_data: `flow_node:${btn.next_node_id}` }]);
    } else if (btn.action_type === "end") {
      rows.push([{ text: btn.label, callback_data: "flow_end" }]);
    }
  }
  return rows;
};

const sendFlowNode = async ({
  chatId,
  node,
  token,
}: {
  chatId: number;
  node: NodeRow;
  token: string;
}) => {
  const keyboard = buildInlineKeyboard(node.automation_flow_buttons ?? []);
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: node.message_text,
  };
  if (keyboard.length > 0) {
    body.reply_markup = { inline_keyboard: keyboard };
  }
  return telegramPost(token, "sendMessage", body);
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

  let token = "";
  try {
    token = decryptTelegramToken(connection.token_ciphertext);
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  // Handle inline button press
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const data = cq.data;

    // Always answer the callback to remove the loading spinner
    if (cq.id) {
      void telegramPost(token, "answerCallbackQuery", { callback_query_id: cq.id });
    }

    if (
      typeof chatId !== "number" ||
      typeof data !== "string" ||
      cq.from?.is_bot
    ) {
      return NextResponse.json({ ok: true });
    }

    if (data === "flow_end" || !data.startsWith("flow_node:")) {
      return NextResponse.json({ ok: true });
    }

    const nodeId = data.slice("flow_node:".length);
    const { data: node, error: nodeError } = await admin
      .from("automation_flow_nodes")
      .select(FLOW_NODE_SELECT)
      .eq("id", nodeId)
      .maybeSingle();

    if (nodeError || !node) return NextResponse.json({ ok: true });

    const sent = await sendFlowNode({ chatId, node: node as NodeRow, token });
    return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
  }

  // Handle regular message
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
  if (!keywordNormalized) return NextResponse.json({ ok: true });

  // Check flows first
  const { data: flow, error: flowError } = await admin
    .from("automation_flows")
    .select("id")
    .eq("telegram_connection_id", connection.id)
    .eq("trigger_type", triggerType)
    .eq("trigger_keyword_normalized", keywordNormalized)
    .eq("is_active", true)
    .maybeSingle();

  if (flowError) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }

  if (flow) {
    const { data: rootNode, error: rootError } = await admin
      .from("automation_flow_nodes")
      .select(FLOW_NODE_SELECT)
      .eq("flow_id", flow.id)
      .eq("is_root", true)
      .maybeSingle();

    if (rootError || !rootNode) return NextResponse.json({ ok: true });

    const sent = await sendFlowNode({ chatId, node: rootNode as NodeRow, token });
    return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
  }

  // Fall back to simple keyword automations
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
  if (!automation) return NextResponse.json({ ok: true });

  const sent = await telegramPost(token, "sendMessage", {
    chat_id: chatId,
    text: automation.reply_text,
  });
  return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
};
