import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  normalizeKeyword,
  toTelegramCommandKeyword,
  type AutomationTriggerType,
} from "@/lib/automations";
import { generateTelegramAiReply } from "@/lib/ai/telegram-assistant";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptTelegramToken } from "@/lib/telegram/token-crypto";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128_000;
const TELEGRAM_TIMEOUT_MS = 8_000;
const TELEGRAM_TYPING_REFRESH_MS = 4_000;
const BOT_ID_RE = /^\d{1,24}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_UUID_RE = /^[A-Za-z0-9_-]{22}$/;

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
    message?: { message_id?: number; chat?: { id?: number } };
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

const withTelegramTyping = async <T>({
  chatId,
  task,
  token,
}: {
  chatId: number;
  task: () => Promise<T>;
  token: string;
}) => {
  const sendTyping = () =>
    telegramPost(token, "sendChatAction", {
      chat_id: chatId,
      action: "typing",
    });

  void sendTyping();
  const refresh = setInterval(() => {
    void sendTyping();
  }, TELEGRAM_TYPING_REFRESH_MS);

  try {
    return await task();
  } finally {
    clearInterval(refresh);
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
  flow_id: string;
  message_text: string;
  replace_on_button_click: boolean;
  back_button_enabled: boolean;
  back_button_label: string;
  automation_flow_buttons: ButtonRow[];
};

const FLOW_NODE_SELECT = `
  id, flow_id, message_text, replace_on_button_click, back_button_enabled, back_button_label,
  automation_flow_buttons:automation_flow_buttons!automation_flow_buttons_node_id_fkey (
    id, label, action_type, next_node_id, url, position
  )
`;

const uuidToCallbackId = (value: string) => {
  if (!UUID_RE.test(value)) return null;
  const bytes = Buffer.from(value.replaceAll("-", ""), "hex");
  return bytes.length === 16 ? bytes.toString("base64url") : null;
};

const callbackIdToUuid = (value: string) => {
  if (!COMPACT_UUID_RE.test(value)) return null;
  try {
    const hex = Buffer.from(value, "base64url").toString("hex");
    if (hex.length !== 32) return null;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
};

const buildNavigationCallback = (
  kind: "flow_go" | "flow_back",
  sourceNodeId: string,
  targetNodeId: string
) => {
  const source = uuidToCallbackId(sourceNodeId);
  const target = uuidToCallbackId(targetNodeId);
  return source && target ? `${kind}:${source}:${target}` : null;
};

const parseNavigationCallback = (value: string) => {
  const [kind, sourceValue, targetValue, extra] = value.split(":");
  if (
    (kind !== "flow_go" && kind !== "flow_back") ||
    !sourceValue ||
    !targetValue ||
    extra
  ) {
    return null;
  }

  const sourceNodeId = callbackIdToUuid(sourceValue);
  const targetNodeId = callbackIdToUuid(targetValue);
  return sourceNodeId && targetNodeId
    ? { sourceNodeId, targetNodeId }
    : null;
};

const buildInlineKeyboard = (node: NodeRow, previousNodeId?: string) => {
  const sorted = [...(node.automation_flow_buttons ?? [])].sort(
    (a, b) => a.position - b.position
  );
  const rows: { text: string; callback_data?: string; url?: string }[][] = [];
  for (const btn of sorted) {
    if (btn.action_type === "url" && btn.url) {
      rows.push([{ text: btn.label, url: btn.url }]);
    } else if (btn.action_type === "node" && btn.next_node_id) {
      const callbackData = buildNavigationCallback(
        "flow_go",
        node.id,
        btn.next_node_id
      );
      if (callbackData) {
        rows.push([{ text: btn.label, callback_data: callbackData }]);
      }
    } else if (btn.action_type === "end") {
      rows.push([{ text: btn.label, callback_data: "flow_end" }]);
    }
  }

  if (node.back_button_enabled && previousNodeId) {
    const callbackData = buildNavigationCallback(
      "flow_back",
      node.id,
      previousNodeId
    );
    if (callbackData) {
      rows.push([{ text: node.back_button_label, callback_data: callbackData }]);
    }
  }

  return rows;
};

const deliverFlowNode = async ({
  chatId,
  messageId,
  node,
  previousNodeId,
  replace,
  token,
}: {
  chatId: number;
  messageId?: number;
  node: NodeRow;
  previousNodeId?: string;
  replace?: boolean;
  token: string;
}) => {
  const keyboard = buildInlineKeyboard(node, previousNodeId);
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: node.message_text,
  };
  if (replace && typeof messageId === "number") {
    body.message_id = messageId;
    body.reply_markup = { inline_keyboard: keyboard };
    return telegramPost(token, "editMessageText", body);
  }
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
    .select("id, user_id, bot_username, token_ciphertext, webhook_secret")
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
    const messageId = cq.message?.message_id;
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

    if (data === "flow_end") {
      return NextResponse.json({ ok: true });
    }

    const navigation = parseNavigationCallback(data);
    if (navigation) {
      const { data: sourceNode, error: sourceError } = await admin
        .from("automation_flow_nodes")
        .select(
          "id, flow_id, replace_on_button_click, automation_flows!inner(telegram_connection_id)"
        )
        .eq("id", navigation.sourceNodeId)
        .eq("automation_flows.telegram_connection_id", connection.id)
        .maybeSingle();

      if (sourceError || !sourceNode) {
        return NextResponse.json({ ok: true });
      }

      const { data: targetNode, error: targetError } = await admin
        .from("automation_flow_nodes")
        .select(FLOW_NODE_SELECT)
        .eq("id", navigation.targetNodeId)
        .eq("flow_id", sourceNode.flow_id)
        .maybeSingle();

      if (targetError || !targetNode) {
        return NextResponse.json({ ok: true });
      }

      const sent = await deliverFlowNode({
        chatId,
        messageId,
        node: targetNode as NodeRow,
        previousNodeId: sourceNode.id,
        replace: sourceNode.replace_on_button_click,
        token,
      });
      return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
    }

    // Keep callbacks from messages sent before the compact navigation format.
    if (!data.startsWith("flow_node:")) {
      return NextResponse.json({ ok: true });
    }

    const nodeId = data.slice("flow_node:".length);
    if (!UUID_RE.test(nodeId)) return NextResponse.json({ ok: true });

    const { data: node, error: nodeError } = await admin
      .from("automation_flow_nodes")
      .select(`${FLOW_NODE_SELECT}, automation_flows!inner(telegram_connection_id)`)
      .eq("id", nodeId)
      .eq("automation_flows.telegram_connection_id", connection.id)
      .maybeSingle();

    if (nodeError || !node) return NextResponse.json({ ok: true });

    const sent = await deliverFlowNode({
      chatId,
      node: node as NodeRow,
      token,
    });
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

    const sent = await deliverFlowNode({
      chatId,
      node: rootNode as NodeRow,
      token,
    });
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
  if (automation) {
    const sent = await telegramPost(token, "sendMessage", {
      chat_id: chatId,
      text: automation.reply_text,
    });
    return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
  }

  // Slash commands never fall through to AI, including unknown commands.
  if (parsedCommand.detected) {
    return NextResponse.json({ ok: true });
  }

  const { data: aiSettings, error: aiSettingsError } = await admin
    .from("ai_assistant_settings")
    .select("is_enabled")
    .eq("user_id", connection.user_id)
    .maybeSingle();

  // Fail closed: if settings cannot be verified, do not send the message to AI.
  if (aiSettingsError || !aiSettings?.is_enabled) {
    return NextResponse.json({ ok: true });
  }

  const aiReply = await withTelegramTyping({
    chatId,
    token,
    task: () => generateTelegramAiReply(text),
  });
  const sent = await telegramPost(token, "sendMessage", {
    chat_id: chatId,
    text:
      aiReply ??
      "در حال حاضر امکان پاسخ‌گویی هوشمند نیست؛ کمی بعد دوباره تلاش کنید.",
  });
  return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
};
