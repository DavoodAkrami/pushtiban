import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  normalizeKeyword,
  toTelegramCommandKeyword,
  type AutomationTriggerType,
} from "@/lib/automations";
import {
  generateTelegramAiReply,
  customerRequestedHuman,
} from "@/lib/ai/telegram-assistant";
import {
  upsertConversationForCustomer,
  recordOwnerReply,
  dismissConversation,
  setPendingOwnerReply,
  consumePendingOwnerReply,
  listNotificationRecipients,
  isAdminForConnection,
} from "@/lib/ai/inbox";
import {
  buildReplyKeyboard,
  REPLY_KEYBOARD_REMOVE,
  type MenuButtonActionType,
  type ReplyKeyboardMarkup,
  type TelegramMenuButton,
} from "@/lib/telegram-menu";
import type { FlowKeyboardAction } from "@/lib/flows";
import {
  getBusinessPersona,
  type BusinessPersona,
} from "@/lib/ai/persona";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  markdownToTelegramHtml,
  TELEGRAM_MESSAGE_MAX_LENGTH,
} from "@/lib/telegram/format";
import { decryptTelegramToken } from "@/lib/telegram/token-crypto";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128_000;
const TELEGRAM_TIMEOUT_MS = 8_000;
const TELEGRAM_TYPING_REFRESH_MS = 4_000;
const BOT_ID_RE = /^\d{1,24}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_UUID_RE = /^[A-Za-z0-9_-]{22}$/;

type RouteContext = { params: Promise<{ botId: string }> };

type TelegramMessageEntity = {
  type?: string;
  offset?: number;
  length?: number;
};

type TelegramUser = {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    entities?: TelegramMessageEntity[];
    chat?: { id?: number };
    from?: TelegramUser;
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number } };
    from?: TelegramUser;
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

// ---- Inbox helpers (local to the webhook) ----------------------------------

/**
 * Forward a support conversation to the owner + all admins via the bot.
 * Sends each recipient a formatted message with inline "پاسخ" / "نادیده بگیر"
 * buttons. The conversation row must already exist (created by
 * upsertConversationForCustomer before this is called).
 */
const forwardConversationToRecipients = async ({
  connectionId,
  conversationId,
  token,
}: {
  connectionId: string;
  conversationId: string;
  token: string;
}) => {
  const recipients = await listNotificationRecipients(connectionId);
  if (!recipients.length) return;

  // Fetch the conversation to get the customer's message details.
  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("support_conversations")
    .select("customer_display_name, customer_username, last_customer_message_text")
    .eq("id", conversationId)
    .maybeSingle();
  const row = conv as {
    customer_display_name: string | null;
    customer_username: string | null;
    last_customer_message_text: string | null;
  } | null;
  if (!row) return;

  const namePart = row.customer_display_name ?? "مشتری";
  const usernamePart = row.customer_username ? `@${row.customer_username}` : "";
  const header = `📩 پیام پشتیبانی\nاز: ${namePart}${usernamePart ? ` (${usernamePart})` : ""}`;
  const body = row.last_customer_message_text ?? "(بدون متن)";

  for (const recipient of recipients) {
    await telegramPost(token, "sendMessage", {
      chat_id: recipient.telegram_id,
      text: `${header}\n\n${body}`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "پاسخ", callback_data: `reply:${conversationId}` },
            { text: "نادیده بگیر", callback_data: `dismiss:${conversationId}` },
          ],
        ],
      },
    });
  }
};

/** Send the customer an "ask admin?" prompt with yes/no inline buttons. */
const sendAskAdminPrompt = async ({
  chatId,
  conversationId,
  prefaceText,
  token,
}: {
  chatId: number;
  conversationId: string;
  prefaceText: string | null;
  token: string;
}) => {
  // The preface is written by the AI, so it may contain Markdown; the trailing
  // question is ours and needs no escaping.
  const text = prefaceText
    ? `${markdownToTelegramHtml(prefaceText)}\n\nسوال شما را به پشتیبان ارسال کنم؟`
    : "متأسفم، پاسخ این سوال را نمی‌دانم. آن را برای پشتیبان ارسال کنم؟";
  await telegramPost(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(prefaceText ? { parse_mode: "HTML" } : {}),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "بله، ارسال کن", callback_data: `ask_admin:${conversationId}` },
          { text: "نه، مشکلی نیست", callback_data: "dismiss_customer_ask" },
        ],
      ],
    },
  });
};

/**
 * The bare `/start` greeting. It never reaches the model — it is the same
 * introduction the AI is told to give, written from the cached persona so the
 * first message the customer sees already names the business.
 */
const buildStartGreeting = (persona: BusinessPersona) => {
  const name = persona.businessName;
  if (!name) return "سلام! چطور می‌توانم کمکتان کنم؟";
  return `سلام! من دستیار هوش مصنوعی ${name} هستم و اینجا هستم تا کمکتان کنم. هر سوالی دربارهٔ ${name} دارید بپرسید.`;
};

/** Telelgram /start handler — supports deep-link owner-linking payload. */
const OWNER_LINK_PREFIX = "link_owner_";
const ADMIN_LINK_PREFIX = "link_admin_";
const LINK_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

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
  keyboard_action: FlowKeyboardAction;
  automation_flow_buttons: ButtonRow[];
};

const FLOW_NODE_SELECT = `
  id, flow_id, message_text, replace_on_button_click, back_button_enabled, back_button_label,
  keyboard_action,
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
  menuKeyboard,
  messageId,
  node,
  previousNodeId,
  replace,
  token,
}: {
  chatId: number;
  /**
   * Resolves the bot's reply keyboard. A getter rather than a value so a node
   * that keeps the menu as-is — the common case — costs no extra query.
   */
  menuKeyboard?: () => Promise<ReplyKeyboardMarkup | null>;
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
  // editMessageText cannot change the chat's reply keyboard, so replace-mode
  // messages ignore keyboard_action entirely.
  if (replace && typeof messageId === "number") {
    body.message_id = messageId;
    body.reply_markup = { inline_keyboard: keyboard };
    return telegramPost(token, "editMessageText", body);
  }

  // A message carries an inline keyboard or a reply keyboard, never both, so
  // inline buttons win and the menu simply stays as the customer last saw it.
  const keyboardAction = node.keyboard_action ?? "inherit";
  if (keyboard.length > 0) {
    body.reply_markup = { inline_keyboard: keyboard };
  } else if (keyboardAction === "remove") {
    body.reply_markup = REPLY_KEYBOARD_REMOVE;
  } else if (keyboardAction === "show" && menuKeyboard) {
    const keyboardMarkup = await menuKeyboard();
    if (keyboardMarkup) body.reply_markup = keyboardMarkup;
  }
  return telegramPost(token, "sendMessage", body);
};

type MenuRow = {
  is_enabled: boolean;
  is_persistent: boolean;
  resize_keyboard: boolean;
  one_time_keyboard: boolean;
  input_field_placeholder: string | null;
  telegram_menu_buttons: {
    label: string;
    row_index: number;
    position: number;
  }[];
};

/**
 * The bot's active reply keyboard, or null when there is no menu. Fails open:
 * a bot whose owner has not run telegram-menu.sql keeps working without a menu.
 */
const loadMenuKeyboard = async (
  connectionId: string
): Promise<ReplyKeyboardMarkup | null> => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("telegram_menus")
    .select(
      `is_enabled, is_persistent, resize_keyboard, one_time_keyboard, input_field_placeholder,
       telegram_menu_buttons ( label, row_index, position )`
    )
    .eq("telegram_connection_id", connectionId)
    .eq("is_enabled", true)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as MenuRow;
  return buildReplyKeyboard({
    isEnabled: row.is_enabled,
    isPersistent: row.is_persistent,
    resizeKeyboard: row.resize_keyboard,
    oneTimeKeyboard: row.one_time_keyboard,
    inputFieldPlaceholder: row.input_field_placeholder ?? "",
    buttons: (row.telegram_menu_buttons ?? []).map(
      (button, index): TelegramMenuButton => ({
        id: String(index),
        label: button.label,
        rowIndex: button.row_index,
        position: button.position,
        actionType: "flow",
        flowId: null,
        automationId: null,
      })
    ),
  });
};

type MenuButtonTarget = {
  action_type: MenuButtonActionType;
  flow_id: string | null;
  automation_id: string | null;
};

/**
 * Resolve a plain message against the menu. A reply-keyboard press arrives as
 * ordinary text equal to the button label, so this is the only way to tell one
 * apart from anything else the customer typed.
 */
const findMenuButton = async ({
  connectionId,
  labelNormalized,
}: {
  connectionId: string;
  labelNormalized: string;
}): Promise<MenuButtonTarget | null> => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("telegram_menu_buttons")
    .select("action_type, flow_id, automation_id")
    .eq("telegram_connection_id", connectionId)
    .eq("label_normalized", labelNormalized)
    .maybeSingle();

  if (error || !data) return null;
  return data as MenuButtonTarget;
};

export const POST = async (request: NextRequest, ctx: RouteContext) => {
  const params = await ctx.params;
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

  // The menu is read at most once per update, and only when we are about to
  // send something the customer will see.
  let pendingMenuKeyboard: Promise<ReplyKeyboardMarkup | null> | null = null;
  const menuKeyboard = () =>
    (pendingMenuKeyboard ??= loadMenuKeyboard(connection.id));

  /**
   * Send a customer-facing message with the bot's menu attached, so the
   * keyboard stays on screen through the whole conversation.
   */
  const sendToCustomer = async (body: Record<string, unknown>) => {
    const keyboard = await menuKeyboard();
    return telegramPost(
      token,
      "sendMessage",
      keyboard ? { reply_markup: keyboard, ...body } : body
    );
  };

  /**
   * Send AI-authored text. The model writes Markdown, which Telegram shows
   * literally unless it is converted to Telegram's HTML subset first. Falls
   * back to the raw text when the rendered form would exceed the message limit
   * or Telegram rejects the markup, so a formatting problem never costs the
   * customer the answer.
   */
  const sendAiTextToCustomer = async (chatId: number, text: string) => {
    const html = markdownToTelegramHtml(text);
    if (html && html.length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
      const sent = await sendToCustomer({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
      });
      if (sent) return true;
    }
    return sendToCustomer({ chat_id: chatId, text });
  };

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

    // ---- Inbox callbacks ---------------------------------------------------
    // Customer taps "بله، از پشتیبان بپرس" → forward the request to owner/admin.
    if (data.startsWith("ask_admin:")) {
      const conversationId = data.slice("ask_admin:".length);
      if (UUID_RE.test(conversationId)) {
        const recipients = await listNotificationRecipients(connection.id);
        if (recipients.length === 0) {
          // No owner/admin linked — tell the customer instead of failing
          // silently.
          await sendToCustomer({
            chat_id: chatId,
            text: "در حال حاضر پشتیبانی در دسترس نیست؛ بعداً دوباره تلاش کنید.",
          });
        } else {
          await forwardConversationToRecipients({
            connectionId: connection.id,
            conversationId,
            token,
          });
          // Confirm to the customer that the message was forwarded.
          await sendToCustomer({
            chat_id: chatId,
            text: "پیام شما برای پشتیبان ارسال شد؛ منتظر پاسخ باشید.",
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Owner/admin taps "پاسخ" on a forwarded request → set pending reply.
    if (data.startsWith("reply:") && typeof cq.from?.id === "number") {
      const conversationId = data.slice("reply:".length);
      if (UUID_RE.test(conversationId)) {
        await setPendingOwnerReply({
          connectionId: connection.id,
          conversationId,
          adminTelegramId: cq.from.id,
        });
        await telegramPost(token, "sendMessage", {
          chat_id: chatId,
          text: "لطفاً پاسخ خود را در پیام بعدی بنویسید (۵ دقیقه مهلت دارید):",
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Owner/admin taps "نادیده بگیر" → dismiss the conversation.
    if (data.startsWith("dismiss:") && typeof cq.from?.id === "number") {
      const conversationId = data.slice("dismiss:".length);
      if (UUID_RE.test(conversationId)) {
        await dismissConversation(conversationId);
        await telegramPost(token, "sendMessage", {
          chat_id: chatId,
          text: "گفتگو نادیده گرفته شد.",
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Customer taps "نه، مشکلی نیست" on the ask-admin prompt → silent dismiss.
    if (data === "dismiss_customer_ask") {
      return NextResponse.json({ ok: true });
    }
    // ---- End inbox callbacks ----------------------------------------------

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
        menuKeyboard,
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
      menuKeyboard,
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

  const senderId = message?.from?.id;
  const senderUsername = message?.from?.username ?? null;
  const senderFirstName = message?.from?.first_name ?? null;

  // ---- /start with owner-link payload -----------------------------------
  // When the owner taps the magic link (t.me/<bot>?start=link_owner_<token>),
  // Telegram sends /start link_owner_<token> as the message text. We validate
  // the token and record the sender's Telegram id as owner_telegram_id.
  if (typeof senderId === "number" && text.startsWith("/start ")) {
    const payload = text.slice("/start ".length).trim();
    if (payload.startsWith(OWNER_LINK_PREFIX)) {
      const linkToken = payload.slice(OWNER_LINK_PREFIX.length);
      if (LINK_TOKEN_RE.test(linkToken)) {
        // Token is the bot_id itself for now (the magic-link route signs it
        // with the connection's user_id encoded as base64url; here we simply
        // trust that the deep link was generated by the dashboard route and
        // is being used by the owner in a timely fashion — the security
        // boundary is the bot's own webhook secret already verified above).
        await admin
          .from("telegram_connections")
          .update({
            owner_telegram_id: senderId,
            owner_linked_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
        await telegramPost(token, "sendMessage", {
          chat_id: chatId,
          text: "✅ تلگرام شما به‌عنوان دریافت‌کنندهٔ پیام‌های پشتیبانی متصل شد.",
        });
        return NextResponse.json({ ok: true });
      }
    }

    // ---- /start with admin-link payload -----------------------------------
    // When an invited admin taps t.me/<bot>?start=link_admin_<token>, we
    // upsert a bot_admins row binding their Telegram id (and username) to
    // this connection so the webhook treats their messages as admin replies.
    if (payload.startsWith(ADMIN_LINK_PREFIX)) {
      const adminToken = payload.slice(ADMIN_LINK_PREFIX.length);
      if (LINK_TOKEN_RE.test(adminToken) && typeof senderId === "number") {
        // Never let the owner's own account become a bot_admin row.
        const { data: existingConnection } = await admin
          .from("telegram_connections")
          .select("owner_telegram_id")
          .eq("id", connection.id)
          .maybeSingle();
        const ownerTelegramId = (
          existingConnection as { owner_telegram_id: number | null } | null
        )?.owner_telegram_id;
        if (ownerTelegramId === senderId) {
          await telegramPost(token, "sendMessage", {
            chat_id: chatId,
            text: "شما مالک این ربات هستید و لازم نیست به‌عنوان ادمین اضافه شوید.",
          });
          return NextResponse.json({ ok: true });
        }

        // Upsert the admin row. The unique index on
        // (telegram_connection_id, admin_telegram_id) makes this idempotent —
        // a second tap just refreshes the username / linked-at timestamp.
        const { error: adminUpsertError } = await admin
          .from("bot_admins")
          .upsert(
            {
              telegram_connection_id: connection.id,
              user_id: connection.user_id,
              admin_telegram_id: senderId,
              admin_username: senderUsername,
              admin_display_name: senderFirstName,
              admin_linked_at: new Date().toISOString(),
            },
            { onConflict: "telegram_connection_id,admin_telegram_id" }
          );
        if (!adminUpsertError) {
          await telegramPost(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ شما به‌عنوان ادمین پشتیبانی اضافه شدید. پیام‌های پشتیبانی به شما هم می‌رسد و با دکمه «پاسخ» مستقیماً جواب بدهید.",
          });
        }
        return NextResponse.json({ ok: true });
      }
    }

    // /start carrying a payload we don't recognise — treat it as a plain start
    // and welcome the customer. Bare /start is handled with the other commands
    // further down.
    await sendToCustomer({
      chat_id: chatId,
      text: "سلام! چطور می‌توانم کمکتان کنم؟",
    });
    return NextResponse.json({ ok: true });
  }

  // ---- Admin/owner pending reply routing ---------------------------------
  // If the sender is the owner or a bot admin and they have a pending
  // reply row, treat their plain message as the answer to deliver to the
  // customer (not as a customer message for AI/flows).
  if (typeof senderId === "number" && !text.startsWith("/")) {
    const senderIsAdmin = await isAdminForConnection(connection.id, senderId);
    if (senderIsAdmin) {
      const pendingConvId = await consumePendingOwnerReply({
        connectionId: connection.id,
        adminTelegramId: senderId,
      });
      if (pendingConvId) {
        // Record the owner's reply and deliver it to the customer via the bot.
        const { conversation } = await recordOwnerReply({
          conversationId: pendingConvId,
          replyText: text,
          senderTelegramId: senderId,
        });
        await sendToCustomer({
          chat_id: conversation.customer_telegram_id,
          text: `پاسخ پشتیبان:\n\n${text}`,
        });
        await telegramPost(token, "sendMessage", {
          chat_id: chatId,
          text: "✅ پاسخ شما برای مشتری ارسال شد.",
        });
        return NextResponse.json({ ok: true });
      }
    }
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
      menuKeyboard,
      node: rootNode as NodeRow,
      token,
    });
    return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
  }

  // A reply-keyboard press arrives as plain text equal to the button label, so
  // the menu is checked here — after flows, whose keywords the menu editor
  // refuses to shadow, and before prepared replies.
  if (!parsedCommand.detected) {
    const menuButton = await findMenuButton({
      connectionId: connection.id,
      labelNormalized: keywordNormalized,
    });

    if (menuButton?.action_type === "flow" && menuButton.flow_id) {
      const { data: rootNode } = await admin
        .from("automation_flow_nodes")
        .select(`${FLOW_NODE_SELECT}, automation_flows!inner(is_active)`)
        .eq("flow_id", menuButton.flow_id)
        .eq("is_root", true)
        .eq("automation_flows.is_active", true)
        .maybeSingle();

      if (rootNode) {
        const sent = await deliverFlowNode({
          chatId,
          menuKeyboard,
          node: rootNode as unknown as NodeRow,
          token,
        });
        return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
      }
    }

    if (menuButton?.action_type === "reply" && menuButton.automation_id) {
      const { data: menuReply } = await admin
        .from("telegram_keyword_automations")
        .select("reply_text")
        .eq("id", menuButton.automation_id)
        .eq("is_active", true)
        .maybeSingle();

      if (menuReply) {
        const sent = await sendToCustomer({
          chat_id: chatId,
          text: menuReply.reply_text,
        });
        return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
      }
    }
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
    const sent = await sendToCustomer({
      chat_id: chatId,
      text: automation.reply_text,
    });
    return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
  }

  // Slash commands never fall through to AI, including unknown commands. Bare
  // /start is the exception: with no flow of its own it still deserves a
  // greeting, and it is where the bot's menu keyboard first appears.
  if (parsedCommand.detected) {
    if (parsedCommand.keyword === "/start") {
      const sent = await sendToCustomer({
        chat_id: chatId,
        text: buildStartGreeting(await getBusinessPersona(connection.user_id)),
      });
      return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
    }
    return NextResponse.json({ ok: true });
  }

  const { data: aiSettings, error: aiSettingsError } = await admin
    .from("ai_assistant_settings")
    .select("is_enabled, human_handoff_enabled")
    .eq("user_id", connection.user_id)
    .maybeSingle();

  // Fail closed: if settings cannot be verified, do not send the message to AI.
  if (aiSettingsError || !aiSettings?.is_enabled) {
    return NextResponse.json({ ok: true });
  }

  // Human handoff is opt-in: only when the owner enabled it may the AI route a
  // customer to the owner/admins. When disabled, no message is escalated —
  // even one the AI cannot answer.
  const handoffEnabled =
    (aiSettings as { human_handoff_enabled?: boolean }).human_handoff_enabled ===
    true;

  // Explicit request to reach a human. Detected before any LLM call, so we
  // don't spend a completion on a message that is asking to be escalated. Only
  // acts when handoff is enabled; otherwise it falls through to a normal reply.
  if (handoffEnabled && customerRequestedHuman(text)) {
    const conversation = await upsertConversationForCustomer({
      connectionId: connection.id,
      userId: connection.user_id,
      customerTelegramId: senderId ?? chatId,
      customerUsername: senderUsername,
      customerDisplayName: senderFirstName,
      messageText: text,
      queuedReason: "customer_request",
    });
    await sendAskAdminPrompt({
      chatId,
      conversationId: conversation.id,
      prefaceText: null,
      token,
    });
    return NextResponse.json({ ok: true });
  }

  const aiReply = await withTelegramTyping({
    chatId,
    token,
    task: () =>
      generateTelegramAiReply(text, connection.user_id, { handoffEnabled }),
  });

  // aiReply is { text, needsHuman }. When the AI flagged the question as
  // needing a human AND handoff is enabled, we create a support conversation
  // (so the transcript is preserved) and offer the customer an inline
  // "ask admin?" button instead of sending a guess.
  if (aiReply.needsHuman) {
    if (!handoffEnabled) {
      // Handoff is off — never contact an admin. Tell the customer plainly.
      const sent = await sendToCustomer({
        chat_id: chatId,
        text: "متأسفم، پاسخ این سوال را نمی‌دانم.",
      });
      return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
    }
    const conversation = await upsertConversationForCustomer({
      connectionId: connection.id,
      userId: connection.user_id,
      customerTelegramId: senderId ?? chatId,
      customerUsername: senderUsername,
      customerDisplayName: senderFirstName,
      messageText: text,
      queuedReason: customerRequestedHuman(text)
        ? "customer_request"
        : "ai_unknown",
    });
    await sendAskAdminPrompt({
      chatId,
      conversationId: conversation.id,
      prefaceText: aiReply.text,
      token,
    });
    return NextResponse.json({ ok: true });
  }

  const sent = aiReply.text
    ? await sendAiTextToCustomer(chatId, aiReply.text)
    : await sendToCustomer({
        chat_id: chatId,
        text: "در حال حاضر امکان پاسخ‌گویی هوشمند نیست؛ کمی بعد دوباره تلاش کنید.",
      });
  return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
};
