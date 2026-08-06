import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { generateAssistantReply, customerRequestedHuman } from "@/lib/ai/assistant";
import {
  upsertConversationForCustomer,
  listNotificationRecipients,
  resolveNotifierBot,
} from "@/lib/ai/inbox";
import { loadChatSession, recordChatTurns } from "@/lib/ai/memory";
import { normalizeKeyword } from "@/lib/automations";
import { decryptSecret } from "@/lib/crypto/secret-box";
import {
  replyToComment,
  sendButtonTemplate,
  sendDirectMessage,
  sendPrivateReply,
  withInstagramTyping,
  type InstagramTemplateButton,
} from "@/lib/instagram/api";
import {
  buildFlowPayload,
  FLOW_END_PAYLOAD,
  parseFlowPayload,
  parseMenuPayload,
  selectMatchingRule,
  type InstagramMatchType,
  type InstagramTriggerType,
} from "@/lib/instagram/automations";
import { markdownToPlainText } from "@/lib/instagram/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// The Instagram webhook.
//
// Structurally the Telegram webhook's sibling, with one difference that shapes
// the whole file: Telegram is told a callback URL per bot, so that route has a
// [botId] segment and a per-connection secret. Instagram's callback URL and
// verify token are configured ONCE in the App Dashboard and serve every
// business on the app, so this is a single route and the account is resolved
// from the payload — `entry[].id` is the Instagram user id.
//
// Deliveries are authenticated by an HMAC of the raw body keyed with the app
// secret. That is why instagram_connections.webhook_secret is unused.
//
// Everything here is best-effort and returns 200 once the delivery is
// authenticated. A non-200 makes Meta retry, and a retry for work we already
// did means the customer gets the same DM twice — so failures are logged and
// swallowed, and idempotency is recorded BEFORE the send, not after.
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 128_000;

/** Namespaces the idempotency key, so a comment id can never collide with a mid. */
const PROCESSED_EVENT_PREFIX = {
  comment: "c:",
  message: "m:",
} as const;

type WebhookMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    quick_reply?: { payload?: string };
    reply_to?: { story?: { id?: string; url?: string }; mid?: string };
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

type WebhookChange = {
  field?: string;
  value?: {
    id?: string;
    text?: string;
    parent_id?: string;
    from?: { id?: string; username?: string };
    media?: { id?: string; media_product_type?: string };
  };
};

type WebhookPayload = {
  object?: string;
  entry?: {
    id?: string;
    time?: number;
    messaging?: WebhookMessaging[];
    changes?: WebhookChange[];
  }[];
};

type Connection = {
  id: string;
  user_id: string;
  instagram_user_id: string;
  token_ciphertext: string;
};

type RuleRow = {
  id: string;
  phrase: string | null;
  match_type: InstagramMatchType;
  media_id: string | null;
  reply_text: string;
  public_reply_text: string | null;
};

/** Shape RuleRow into what selectMatchingRule reads, without losing the row. */
const toRule = (row: RuleRow) => ({
  ...row,
  phrase: row.phrase,
  matchType: row.match_type,
  mediaId: row.media_id,
});

// ---- Verification ----------------------------------------------------------

const verifyTokenMatches = (received: string | null) => {
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!expected || !received || received.length > 256) return false;
  const r = Buffer.from(received);
  const e = Buffer.from(expected);
  return r.length === e.length && timingSafeEqual(r, e);
};

/**
 * Meta signs the raw request body with the app secret. The comparison has to
 * happen on the bytes we received, before any JSON round-trip: re-serializing
 * changes whitespace and key order, and the signature would never match again.
 */
const signatureMatches = (rawBody: string, header: string | null) => {
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  if (received.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
};

/**
 * GET is Meta's subscription handshake: it calls once with a challenge and
 * expects it echoed back verbatim as plain text.
 */
export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;

  if (
    params.get("hub.mode") === "subscribe" &&
    verifyTokenMatches(params.get("hub.verify_token"))
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
};

// ---- Idempotency -----------------------------------------------------------

/**
 * Claim an event. Returns true when this delivery is ours to handle, false when
 * some earlier delivery already took it.
 *
 * The unique index does the work: a duplicate insert fails, and that failure IS
 * the answer. Claiming happens before any send, so a crash mid-handler costs
 * the customer a reply rather than sending them two.
 */
const claimEvent = async (
  connectionId: string,
  eventKey: string
): Promise<boolean> => {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("instagram_processed_events").insert({
      instagram_connection_id: connectionId,
      event_key: eventKey,
    });
    return !error;
  } catch {
    // A table that is not there yet must not silence the whole channel; the
    // owner has simply not run the SQL, and duplicates are the lesser harm.
    return true;
  }
};

// ---- Flows -----------------------------------------------------------------
//
// The same automation_flows tree the Telegram webhook walks, delivered with
// what Instagram has instead of an inline keyboard: a button template.
//
// Three things Telegram does that Instagram cannot, and how each is answered:
//   - Edit a message in place (`replace_on_button_click`). Instagram cannot, so
//     every step is a new message; the API stores the flag off for Instagram
//     flows rather than accepting it and ignoring it here.
//   - Show or remove a reply keyboard (`keyboard_action`). There is no such
//     keyboard; the DM menu is account-wide and lives on its own page.
//   - Carry the trail in a callback query. A postback is all we get, so the
//     node we came from travels inside the payload.

type FlowButtonRow = {
  label: string;
  action_type: "node" | "url" | "end";
  next_node_id: string | null;
  url: string | null;
  position: number;
};

type FlowNodeRow = {
  id: string;
  flow_id: string;
  message_text: string;
  back_button_enabled: boolean;
  back_button_label: string;
  automation_flow_buttons: FlowButtonRow[];
};

const FLOW_NODE_SELECT = `
  id, flow_id, message_text, back_button_enabled, back_button_label,
  automation_flow_buttons:automation_flow_buttons!automation_flow_buttons_node_id_fkey (
    label, action_type, next_node_id, url, position
  )
`;

/**
 * Turn a node's buttons into Instagram's three.
 *
 * The order is the owner's, and the back button comes last — it is the one the
 * customer looks for when the others are not what they wanted. Meta takes the
 * first three and rejects nothing, so a node authored within the limit (which
 * the editor and the API both enforce) arrives whole.
 */
const buildFlowButtons = (
  node: FlowNodeRow,
  previousNodeId?: string | null
): InstagramTemplateButton[] => {
  const buttons: InstagramTemplateButton[] = [];

  for (const button of [...(node.automation_flow_buttons ?? [])].sort(
    (first, second) => first.position - second.position
  )) {
    if (button.action_type === "url" && button.url) {
      buttons.push({ type: "web_url", title: button.label, url: button.url });
    } else if (button.action_type === "node" && button.next_node_id) {
      buttons.push({
        type: "postback",
        title: button.label,
        payload: buildFlowPayload(button.next_node_id, node.id),
      });
    } else if (button.action_type === "end") {
      buttons.push({
        type: "postback",
        title: button.label,
        payload: FLOW_END_PAYLOAD,
      });
    }
  }

  if (node.back_button_enabled && previousNodeId) {
    buttons.push({
      type: "postback",
      title: node.back_button_label,
      payload: buildFlowPayload(previousNodeId, node.id),
    });
  }

  return buttons;
};

const deliverFlowNode = async ({
  connection,
  node,
  previousNodeId,
  recipientId,
  token,
}: {
  connection: Connection;
  node: FlowNodeRow;
  previousNodeId?: string | null;
  recipientId: string;
  token: string;
}) => {
  const buttons = buildFlowButtons(node, previousNodeId);
  const igUserId = connection.instagram_user_id;

  return buttons.length
    ? sendButtonTemplate({
        buttons,
        igUserId,
        recipientId,
        text: node.message_text,
        token,
      })
    : sendDirectMessage({
        igUserId,
        recipientId,
        text: node.message_text,
        token,
      });
};

/**
 * The flow a plain message starts, or null.
 *
 * Matching is exact on the normalized keyword, exactly as on Telegram: a flow
 * on «سلام» that fired on every message containing a greeting would swallow the
 * assistant, and the owner has keyword rules for the looser case.
 */
const findFlowRootNode = async (
  connectionId: string,
  text: string
): Promise<FlowNodeRow | null> => {
  const keywordNormalized = normalizeKeyword(text);
  if (!keywordNormalized) return null;

  const admin = createAdminClient();
  const { data: flow } = await admin
    .from("automation_flows")
    .select("id")
    .eq("instagram_connection_id", connectionId)
    .eq("trigger_keyword_normalized", keywordNormalized)
    .eq("is_active", true)
    .maybeSingle();

  if (!flow) return null;

  const { data } = await admin
    .from("automation_flow_nodes")
    .select(FLOW_NODE_SELECT)
    .eq("flow_id", (flow as { id: string }).id)
    .eq("is_root", true)
    .maybeSingle();

  return (data as FlowNodeRow | null) ?? null;
};

/**
 * The node behind a tapped flow button.
 *
 * The join is the authorization: a payload is a string the customer's client
 * sent back to us, so the node is only ever loaded when its flow belongs to
 * this connection. Without it a crafted postback could read any business's
 * flow.
 */
const loadFlowNode = async (
  connectionId: string,
  nodeId: string
): Promise<FlowNodeRow | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("automation_flow_nodes")
    .select(
      `${FLOW_NODE_SELECT}, automation_flows!inner(instagram_connection_id, is_active)`
    )
    .eq("id", nodeId)
    .eq("automation_flows.instagram_connection_id", connectionId)
    .eq("automation_flows.is_active", true)
    .maybeSingle();

  return (data as FlowNodeRow | null) ?? null;
};

// ---- Rule lookup -----------------------------------------------------------

const loadRules = async (
  connectionId: string,
  triggerType: InstagramTriggerType
): Promise<RuleRow[]> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("instagram_automations")
    .select("id, phrase, match_type, media_id, reply_text, public_reply_text")
    .eq("instagram_connection_id", connectionId)
    .eq("trigger_type", triggerType)
    .eq("is_active", true)
    .limit(200);

  return (data as RuleRow[] | null) ?? [];
};

// ---- Message handling ------------------------------------------------------

/**
 * The one reply that always needs a hand-written Persian fallback: nothing
 * matched, the assistant is off, and staying silent is correct — the same
 * choice the Telegram webhook makes.
 */
const NO_HANDLER = NextResponse.json({ ok: true });

const handleMessaging = async ({
  connection,
  event,
  token,
}: {
  connection: Connection;
  event: WebhookMessaging;
  token: string;
}): Promise<void> => {
  const message = event.message;
  const senderId = event.sender?.id;
  if (!senderId) return;

  // The business's own messages come back as webhooks, including ones typed by
  // hand in the Instagram app. Without this the assistant answers itself.
  if (message?.is_echo || senderId === connection.instagram_user_id) return;
  if (message?.is_deleted) return;

  const igUserId = connection.instagram_user_id;
  const send = (text: string, quickReplies?: { title: string; payload: string }[]) =>
    sendDirectMessage({
      igUserId,
      quickReplies,
      recipientId: senderId,
      text,
      token,
    });

  // ---- Ice breaker / persistent menu taps ---------------------------------
  // These arrive either as a postback or, for some surfaces, as a quick reply.
  // Both carry our own payload, so the reply is looked up by id rather than
  // trusted from what came back over the wire.
  const payload = event.postback?.payload ?? message?.quick_reply?.payload;
  if (payload) {
    const eventKey = `${PROCESSED_EVENT_PREFIX.message}${
      event.postback?.mid ?? message?.mid ?? `${senderId}:${event.timestamp ?? 0}`
    }`;
    if (!(await claimEvent(connection.id, eventKey))) return;

    // The escalation chips answer here rather than through the menu table.
    if (payload.startsWith("pushtiban_handoff:")) {
      await handleHandoffChoice({
        connection,
        payload,
        senderId,
        token,
      });
      return;
    }

    // A flow button. `end` closes the path with nothing further to send, the
    // same silence Telegram's flow_end callback leaves behind.
    if (payload === FLOW_END_PAYLOAD) return;

    const flowStep = parseFlowPayload(payload);
    if (flowStep) {
      const node = await loadFlowNode(connection.id, flowStep.targetNodeId);
      if (node) {
        await deliverFlowNode({
          connection,
          node,
          previousNodeId: flowStep.sourceNodeId,
          recipientId: senderId,
          token,
        });
      }
      return;
    }

    const itemId = parseMenuPayload(payload);
    if (!itemId) return;

    const admin = createAdminClient();
    const { data } = await admin
      .from("instagram_dm_menu_items")
      .select("reply_text")
      .eq("id", itemId)
      .eq("instagram_connection_id", connection.id)
      .maybeSingle();

    const item = data as { reply_text: string } | null;
    if (item) await send(item.reply_text);
    return;
  }

  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const attachments = message?.attachments ?? [];
  const isStoryMention = attachments.some(
    (attachment) => attachment.type === "story_mention"
  );
  const isStoryReply = Boolean(message?.reply_to?.story);

  // A message with neither text nor a story attachment is a photo, a voice note
  // or a share — nothing here can act on it.
  if (!text && !isStoryMention) return;

  if (!message?.mid) return;
  if (
    !(await claimEvent(
      connection.id,
      `${PROCESSED_EVENT_PREFIX.message}${message.mid}`
    ))
  ) {
    return;
  }

  // ---- Story triggers -----------------------------------------------------
  // Both arrive on the messages field rather than a field of their own: a story
  // reply is a DM carrying reply_to.story, a mention is a DM carrying a
  // story_mention attachment.
  if (isStoryMention || isStoryReply) {
    const rules = await loadRules(
      connection.id,
      isStoryMention ? "story_mention" : "story_reply"
    );
    const rule = selectMatchingRule(rules.map(toRule), { text });
    if (rule) {
      await send(rule.reply_text);
      return;
    }
    // No story rule matched — a story reply is still ordinary text, so it falls
    // through to keywords and the assistant. A bare mention has nothing to fall
    // through with.
    if (isStoryMention && !text) return;
  }

  // ---- Flows --------------------------------------------------------------
  // Before prepared replies and before the assistant, which is the order the
  // Telegram webhook uses and the order the «مسیر پاسخ» strip on the overview
  // promises: flows → keywords → assistant → human.
  const flowRoot = await findFlowRootNode(connection.id, text);
  if (flowRoot) {
    await deliverFlowNode({
      connection,
      node: flowRoot,
      recipientId: senderId,
      token,
    });
    return;
  }

  // ---- Keyword rules ------------------------------------------------------
  const keywordRules = await loadRules(connection.id, "dm_keyword");
  const keywordRule = selectMatchingRule(keywordRules.map(toRule), { text });
  if (keywordRule) {
    await send(keywordRule.reply_text);
    return;
  }

  // ---- Assistant ----------------------------------------------------------
  await handleWithAssistant({ connection, senderId, text, token });
};

/**
 * The AI fallback, reached only after every rule has declined — the same
 * position it holds on Telegram.
 */
const handleWithAssistant = async ({
  connection,
  senderId,
  text,
  token,
}: {
  connection: Connection;
  senderId: string;
  text: string;
  token: string;
}) => {
  const admin = createAdminClient();
  const { data: settings, error } = await admin
    .from("ai_assistant_settings")
    .select("is_enabled, instagram_enabled, human_handoff_enabled")
    .eq("user_id", connection.user_id)
    .maybeSingle();

  // Fail closed: settings we cannot verify never authorize an LLM call.
  if (error || !settings?.is_enabled) return;

  const row = settings as {
    is_enabled: boolean;
    instagram_enabled?: boolean;
    human_handoff_enabled?: boolean;
  };

  // Absent column (the owner has not run channel-inbox.sql) reads as enabled,
  // matching the default the migration sets.
  if (row.instagram_enabled === false) return;

  const handoffEnabled = row.human_handoff_enabled === true;
  const igUserId = connection.instagram_user_id;
  const send = (
    body: string,
    quickReplies?: { title: string; payload: string }[]
  ) =>
    sendDirectMessage({
      igUserId,
      quickReplies,
      recipientId: senderId,
      text: body,
      token,
    });

  // An explicit «با پشتیبان صحبت کنم» is caught before any completion — a free
  // escalation, exactly as on Telegram.
  if (handoffEnabled && customerRequestedHuman(text)) {
    await offerHandoff({ connection, prefaceText: null, senderId, text, token });
    return;
  }

  const session = await loadChatSession({
    channel: "instagram",
    connectionId: connection.id,
    chatId: senderId,
  });

  const reply = await withInstagramTyping({
    igUserId,
    recipientId: senderId,
    token,
    task: () =>
      generateAssistantReply(text, connection.user_id, {
        channel: "instagram",
        handoffEnabled,
        history: session.turns,
      }),
  });

  const remember = (assistantText: string | null) =>
    recordChatTurns({
      channel: "instagram",
      connectionId: connection.id,
      chatId: senderId,
      turns: [
        { role: "user", text },
        ...(assistantText
          ? [{ role: "assistant" as const, text: assistantText }]
          : []),
      ],
    });

  if (reply.needsHuman) {
    if (!handoffEnabled) {
      await send("متأسفم، پاسخ این سوال را نمی‌دانم.");
      await remember(null);
      return;
    }
    await offerHandoff({
      connection,
      prefaceText: reply.text,
      senderId,
      text,
      token,
    });
    await remember(reply.text);
    return;
  }

  // The model writes Markdown and Instagram renders none of it, so the reply is
  // flattened rather than sent with the asterisks still on.
  await send(
    reply.text
      ? markdownToPlainText(reply.text)
      : "در حال حاضر امکان پاسخ‌گویی هوشمند نیست؛ کمی بعد دوباره تلاش کنید."
  );
  await remember(reply.text);
};

// ---- Handoff ---------------------------------------------------------------

const HANDOFF_YES = "pushtiban_handoff:yes:";
const HANDOFF_NO = "pushtiban_handoff:no";

/**
 * Ask the customer whether to involve a human, with quick-reply chips.
 *
 * Instagram's chips are the nearest thing it has to Telegram's inline keyboard.
 * The difference that matters: tapping one sends it as a normal message rather
 * than a callback, so the answer comes back through the same handler as
 * everything else and must be recognised by its payload.
 */
const offerHandoff = async ({
  connection,
  prefaceText,
  senderId,
  text,
  token,
}: {
  connection: Connection;
  prefaceText: string | null;
  senderId: string;
  text: string;
  token: string;
}) => {
  const conversation = await upsertConversationForCustomer({
    channel: "instagram",
    connectionId: connection.id,
    customerExternalId: senderId,
    userId: connection.user_id,
    messageText: text,
    queuedReason: customerRequestedHuman(text)
      ? "customer_request"
      : "ai_unknown",
  });

  const preface = prefaceText
    ? `${markdownToPlainText(prefaceText)}\n\n`
    : "متأسفم، پاسخ این سوال را نمی‌دانم. ";

  await sendDirectMessage({
    igUserId: connection.instagram_user_id,
    quickReplies: [
      { title: "بله، بفرست", payload: `${HANDOFF_YES}${conversation.id}` },
      { title: "نه، مشکلی نیست", payload: HANDOFF_NO },
    ],
    recipientId: senderId,
    text: `${preface}سوال شما را به پشتیبان ارسال کنم؟`,
    token,
  });
};

/** The customer tapped one of the two handoff chips. */
const handleHandoffChoice = async ({
  connection,
  payload,
  senderId,
  token,
}: {
  connection: Connection;
  payload: string;
  senderId: string;
  token: string;
}) => {
  if (payload === HANDOFF_NO) return;
  if (!payload.startsWith(HANDOFF_YES)) return;

  const conversationId = payload.slice(HANDOFF_YES.length);
  const forwarded = await mirrorConversationToTelegram({
    conversationId,
    userId: connection.user_id,
  });

  await sendDirectMessage({
    igUserId: connection.instagram_user_id,
    recipientId: senderId,
    // Honest either way: the thread is in the dashboard regardless, and the
    // owner may simply not have a Telegram bot to be pinged on.
    text: forwarded
      ? "پیام شما برای پشتیبان ارسال شد؛ منتظر پاسخ باشید."
      : "پیام شما ثبت شد؛ پشتیبان در اولین فرصت پاسخ می‌دهد.",
    token,
  });
};

/**
 * Ping the owner and their admins on Telegram about an Instagram thread.
 *
 * Instagram cannot message a business's own owner — the API only talks to
 * people who wrote to the account first — so the notification rides the
 * business's Telegram bot when they have one. Returns false when they do not,
 * which is not a failure: the conversation is in /dashboard/inbox either way.
 */
const mirrorConversationToTelegram = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}): Promise<boolean> => {
  const notifier = await resolveNotifierBot(userId);
  if (!notifier) return false;

  const recipients = await listNotificationRecipients(notifier.connectionId);
  if (!recipients.length) return false;

  const admin = createAdminClient();
  const { data } = await admin
    .from("support_conversations")
    .select("customer_display_name, customer_username, last_customer_message_text")
    .eq("id", conversationId)
    .maybeSingle();

  const row = data as {
    customer_display_name: string | null;
    customer_username: string | null;
    last_customer_message_text: string | null;
  } | null;
  if (!row) return false;

  const name = row.customer_display_name ?? "مشتری اینستاگرام";
  const username = row.customer_username ? ` (@${row.customer_username})` : "";
  const header = `📸 پیام پشتیبانی از اینستاگرام\nاز: ${name}${username}`;
  const body = row.last_customer_message_text ?? "(بدون متن)";

  let delivered = false;
  for (const recipient of recipients) {
    const response = await fetch(
      `https://api.telegram.org/bot${notifier.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: recipient.telegram_id,
          text: `${header}\n\n${body}`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "پاسخ", callback_data: `reply:${conversationId}` },
                {
                  text: "نادیده بگیر",
                  callback_data: `dismiss:${conversationId}`,
                },
              ],
            ],
          },
        }),
        cache: "no-store",
      }
    ).catch(() => null);

    if (response?.ok) delivered = true;
  }

  return delivered;
};

// ---- Comment handling ------------------------------------------------------

const handleComment = async ({
  change,
  connection,
  token,
}: {
  change: WebhookChange;
  connection: Connection;
  token: string;
}): Promise<void> => {
  const value = change.value;
  const commentId = value?.id;
  const text = typeof value?.text === "string" ? value.text.trim() : "";
  if (!commentId || !text) return;

  // Our own public replies arrive here as comments too. Without this a rule
  // whose public reply contains its own trigger word answers itself forever.
  if (value?.from?.id === connection.instagram_user_id) return;

  if (
    !(await claimEvent(
      connection.id,
      `${PROCESSED_EVENT_PREFIX.comment}${commentId}`
    ))
  ) {
    return;
  }

  const rules = await loadRules(connection.id, "comment");
  const rule = selectMatchingRule(rules.map(toRule), {
    mediaId: value?.media?.id ?? null,
    text,
  });
  if (!rule) return;

  // The private reply is the point of the feature: a business has no open
  // messaging window with someone who has only commented, and addressing the
  // message by comment id is the only thing that opens one.
  await sendPrivateReply({
    commentId,
    igUserId: connection.instagram_user_id,
    text: rule.reply_text,
    token,
  });

  if (rule.public_reply_text) {
    await replyToComment({
      commentId,
      text: rule.public_reply_text,
      token,
    });
  }
};

// ---- Entry point -----------------------------------------------------------

export const POST = async (request: NextRequest) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // Raw text, not request.json(): the signature covers these exact bytes.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (!signatureMatches(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.object !== "instagram") return NO_HANDLER;

  const admin = createAdminClient();

  for (const entry of payload.entry ?? []) {
    if (!entry.id) continue;

    const { data } = await admin
      .from("instagram_connections")
      .select("id, user_id, instagram_user_id, token_ciphertext")
      .eq("instagram_user_id", entry.id)
      .maybeSingle();

    const connection = data as Connection | null;
    if (!connection) continue;

    let token = "";
    try {
      token = decryptSecret(connection.token_ciphertext);
    } catch {
      console.error(
        `Instagram webhook: unreadable token for connection ${connection.id}`
      );
      continue;
    }

    // Each event is isolated: one bad message must not cost the rest of the
    // batch, and Meta will not resend the ones that did work.
    for (const event of entry.messaging ?? []) {
      try {
        await handleMessaging({ connection, event, token });
      } catch (error) {
        console.error("Instagram webhook message handler failed:", error);
      }
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      try {
        await handleComment({ change, connection, token });
      } catch (error) {
        console.error("Instagram webhook comment handler failed:", error);
      }
    }
  }

  return NO_HANDLER;
};
