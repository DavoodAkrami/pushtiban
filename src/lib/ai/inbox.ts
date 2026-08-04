import "server-only";

import { decryptSecret } from "@/lib/crypto/secret-box";
import { sendHumanAgentMessage } from "@/lib/instagram/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptTelegramToken } from "@/lib/telegram/token-crypto";

/**
 * Inbox helpers shared by the channel webhooks and the website /api/inbox
 * routes. All reads/writes go through the service-role admin client because
 * the webhooks are unauthenticated (Telegram and Meta hit them directly) and
 * must scope by the owner's user_id which they already have from the connection
 * lookup.
 *
 * A conversation belongs to a CHANNEL. `customer_external_id` is the canonical
 * key — a Telegram numeric id rendered as text, or an Instagram IGSID — and
 * `customer_telegram_id` survives alongside it only because the Telegram Bot
 * API wants a numeric chat_id and re-parsing it on every reply would be
 * gratuitous. See supabase/channel-inbox.sql.
 *
 * One asymmetry worth stating: notification recipients are always Telegram.
 * The Instagram API gives a business no way to message its own owner, so an
 * escalated Instagram thread always lands in the dashboard inbox and is
 * *additionally* mirrored to Telegram when a bot with a linked owner exists.
 */

export type SupportChannel = "telegram" | "instagram";

export type SupportConversationRow = {
  id: string;
  channel: SupportChannel;
  telegram_connection_id: string | null;
  instagram_connection_id: string | null;
  user_id: string;
  customer_external_id: string;
  customer_telegram_id: number | null;
  customer_username: string | null;
  customer_display_name: string | null;
  status: "open" | "answered" | "closed" | "dismissed";
  queued_reason: "ai_unknown" | "customer_request" | "ai_disabled" | "frustration";
  last_customer_message_text: string | null;
  last_customer_message_at: string | null;
  assigned_admin_telegram_id: number | null;
  created_at: string;
  updated_at: string;
};

/** Identifies a customer thread without caring which channel it is on. */
export type ConversationKey = {
  channel: SupportChannel;
  connectionId: string;
  /** Telegram numeric id as a string, or an Instagram IGSID. */
  customerExternalId: string;
};

/** The connection column that holds this channel's connection id. */
const connectionColumnFor = (channel: SupportChannel) =>
  channel === "telegram"
    ? "telegram_connection_id"
    : "instagram_connection_id";

export type SupportMessageRow = {
  id: string;
  conversation_id: string;
  role: "customer" | "owner" | "assistant" | "system";
  content: string;
  sender_telegram_id: number | null;
  created_at: string;
};

export type BotAdminRow = {
  id: string;
  telegram_connection_id: string;
  user_id: string;
  admin_telegram_id: number;
  admin_display_name: string | null;
  created_at: string;
};

const PENDING_REPLY_TTL_MINUTES = 5;

/**
 * Returns the most recent *open* conversation for a given customer on a given
 * connection, or null. Lets us append a follow-up message to an existing thread
 * instead of opening a new row each time.
 */
const findOpenConversation = async ({
  channel,
  connectionId,
  customerExternalId,
}: ConversationKey): Promise<SupportConversationRow | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_conversations")
    .select("*")
    .eq("channel", channel)
    .eq(connectionColumnFor(channel), connectionId)
    .eq("customer_external_id", customerExternalId)
    .in("status", ["open", "answered"])
    .order("last_customer_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SupportConversationRow | null) ?? null;
};

/**
 * Create a new support conversation + the initial customer message row.
 * Returns the conversation row.
 */
export const createSupportConversation = async ({
  channel,
  connectionId,
  customerExternalId,
  userId,
  customerUsername,
  customerDisplayName,
  messageText,
  queuedReason,
}: ConversationKey & {
  userId: string;
  customerUsername?: string | null;
  customerDisplayName?: string | null;
  messageText: string;
  queuedReason: SupportConversationRow["queued_reason"];
}): Promise<SupportConversationRow> => {
  const admin = createAdminClient();

  const { data: conversation, error } = await admin
    .from("support_conversations")
    .insert({
      channel,
      [connectionColumnFor(channel)]: connectionId,
      user_id: userId,
      customer_external_id: customerExternalId,
      // Telegram keeps its numeric column populated; Instagram has no numeric
      // id to put there, and the check constraint does not ask for one.
      customer_telegram_id:
        channel === "telegram" ? Number(customerExternalId) : null,
      customer_username: customerUsername ?? null,
      customer_display_name: customerDisplayName ?? null,
      status: "open",
      queued_reason: queuedReason,
      last_customer_message_text: messageText,
      last_customer_message_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !conversation) {
    throw new Error(`Failed to create support conversation: ${error?.message ?? "unknown"}`);
  }

  const conv = conversation as SupportConversationRow;

  await admin.from("support_messages").insert({
    conversation_id: conv.id,
    role: "customer",
    content: messageText,
  });

  return conv;
};

/**
 * Append a customer follow-up message to an existing conversation and reopen
 * it if it was in "answered" status (the customer came back).
 */
export const appendCustomerMessage = async ({
  conversationId,
  messageText,
}: {
  conversationId: string;
  messageText: string;
}): Promise<void> => {
  const admin = createAdminClient();
  await admin.from("support_messages").insert({
    conversation_id: conversationId,
    role: "customer",
    content: messageText,
  });
  await admin
    .from("support_conversations")
    .update({
      last_customer_message_text: messageText,
      last_customer_message_at: new Date().toISOString(),
      status: "open",
    })
    .eq("id", conversationId);
};

/**
 * Get or create an open conversation for this customer on this connection. Used
 * by the channel webhooks when the customer asks for a human, so we reuse the
 * thread if one exists.
 */
export const upsertConversationForCustomer = async ({
  channel,
  connectionId,
  customerExternalId,
  userId,
  customerUsername,
  customerDisplayName,
  messageText,
  queuedReason,
}: ConversationKey & {
  userId: string;
  customerUsername?: string | null;
  customerDisplayName?: string | null;
  messageText: string;
  queuedReason: SupportConversationRow["queued_reason"];
}): Promise<SupportConversationRow> => {
  const existing = await findOpenConversation({
    channel,
    connectionId,
    customerExternalId,
  });
  if (existing) {
    await appendCustomerMessage({
      conversationId: existing.id,
      messageText,
    });
    return { ...existing, last_customer_message_text: messageText };
  }
  return createSupportConversation({
    channel,
    connectionId,
    customerExternalId,
    userId,
    customerUsername,
    customerDisplayName,
    messageText,
    queuedReason,
  });
};

/**
 * Record the owner/admin's reply and mark the conversation answered. Delivery
 * is the caller's job — see `deliverConversationReply` — so a reply is never
 * recorded as sent when the channel rejected it.
 */
export const recordOwnerReply = async ({
  conversationId,
  replyText,
  senderTelegramId,
}: {
  conversationId: string;
  replyText: string;
  senderTelegramId?: number | null;
}): Promise<{ ok: true; conversation: SupportConversationRow }> => {
  const admin = createAdminClient();

  const { data: conversation } = await admin
    .from("support_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  const conv = conversation as SupportConversationRow | null;
  if (!conv) throw new Error("Conversation not found");

  await admin.from("support_messages").insert({
    conversation_id: conversationId,
    role: "owner",
    content: replyText,
    sender_telegram_id: senderTelegramId ?? null,
  });

  await admin
    .from("support_conversations")
    .update({
      status: "answered",
      assigned_admin_telegram_id: senderTelegramId ?? conv.assigned_admin_telegram_id,
    })
    .eq("id", conversationId);

  return { ok: true, conversation: conv };
};

/** One conversation by id, or null. Needed before delivering a reply to it. */
export const getConversation = async (
  conversationId: string
): Promise<SupportConversationRow | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  return (data as SupportConversationRow | null) ?? null;
};

/**
 * Send a human's reply to the customer, on whichever channel they are on.
 *
 * The two channels differ in more than the endpoint. Telegram has no messaging
 * window at all, so a reply days later is fine. Instagram closes the window 24
 * hours after the customer's last message, and the only thing that reopens it is
 * the HUMAN_AGENT tag — which is exactly what this is, and which buys 7 days.
 * Past that Meta rejects the send and we report it rather than recording a reply
 * the customer never saw.
 *
 * Returns false on failure; the caller decides whether to record the reply.
 */
export const deliverConversationReply = async ({
  conversation,
  text,
}: {
  conversation: SupportConversationRow;
  text: string;
}): Promise<boolean> => {
  const admin = createAdminClient();
  const body = `پاسخ پشتیبان:\n\n${text}`;

  if (conversation.channel === "instagram") {
    if (!conversation.instagram_connection_id) return false;

    const { data } = await admin
      .from("instagram_connections")
      .select("instagram_user_id, token_ciphertext")
      .eq("id", conversation.instagram_connection_id)
      .maybeSingle();

    const row = data as {
      instagram_user_id: string;
      token_ciphertext: string;
    } | null;
    if (!row) return false;

    try {
      return await sendHumanAgentMessage({
        igUserId: row.instagram_user_id,
        recipientId: conversation.customer_external_id,
        text: body,
        token: decryptSecret(row.token_ciphertext),
      });
    } catch {
      return false;
    }
  }

  if (!conversation.telegram_connection_id) return false;

  const { data } = await admin
    .from("telegram_connections")
    .select("token_ciphertext")
    .eq("id", conversation.telegram_connection_id)
    .maybeSingle();

  const row = data as { token_ciphertext: string } | null;
  if (!row) return false;

  let token = "";
  try {
    token = decryptTelegramToken(row.token_ciphertext);
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:
            conversation.customer_telegram_id ??
            Number(conversation.customer_external_id),
          text: body,
        }),
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

/**
 * Mark a conversation dismissed (owner tapped "نادیده بگیر" or closed it via
 * the website).
 */
export const closeConversation = async (
  conversationId: string
): Promise<void> => {
  const admin = createAdminClient();
  await admin
    .from("support_conversations")
    .update({ status: "closed" })
    .eq("id", conversationId);
};

export const dismissConversation = async (
  conversationId: string
): Promise<void> => {
  const admin = createAdminClient();
  await admin
    .from("support_conversations")
    .update({ status: "dismissed" })
    .eq("id", conversationId);
};

/**
 * Set a pending_owner_replies row so the owner's next plain message to the
 * bot is captured as the reply for this conversation.
 */
export const setPendingOwnerReply = async ({
  connectionId,
  conversationId,
  adminTelegramId,
}: {
  connectionId: string;
  conversationId: string;
  adminTelegramId: number;
}): Promise<void> => {
  const admin = createAdminClient();
  // Replace any existing pending row for this admin on this connection.
  await admin
    .from("pending_owner_replies")
    .delete()
    .eq("telegram_connection_id", connectionId)
    .eq("admin_telegram_id", adminTelegramId);
  await admin.from("pending_owner_replies").insert({
    telegram_connection_id: connectionId,
    conversation_id: conversationId,
    admin_telegram_id: adminTelegramId,
  });
};

/**
 * Consume the pending reply row for an admin, if any. Deletes expired rows
 * (older than TTL) before querying. Returns the conversation id or null.
 */
export const consumePendingOwnerReply = async ({
  connectionId,
  adminTelegramId,
}: {
  connectionId: string;
  adminTelegramId: number;
}): Promise<string | null> => {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - PENDING_REPLY_TTL_MINUTES * 60 * 1000).toISOString();

  // Delete expired rows for this connection.
  await admin
    .from("pending_owner_replies")
    .delete()
    .lt("created_at", cutoff);

  const { data: pending } = await admin
    .from("pending_owner_replies")
    .select("conversation_id")
    .eq("telegram_connection_id", connectionId)
    .eq("admin_telegram_id", adminTelegramId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return null;

  // Delete the consumed row.
  await admin
    .from("pending_owner_replies")
    .delete()
    .eq("telegram_connection_id", connectionId)
    .eq("admin_telegram_id", adminTelegramId);

  return (pending as { conversation_id: string }).conversation_id;
};

/**
 * The Telegram bot a business can be notified through, whatever channel the
 * customer is on.
 *
 * Instagram gives a business no way to message its own owner — the API only
 * talks to people who messaged the account first. So an escalated Instagram
 * thread is mirrored to the owner over Telegram when they have a bot, and lives
 * in the dashboard inbox either way. Returns null when there is no bot, which is
 * not an error: the inbox is still there.
 */
export const resolveNotifierBot = async (
  userId: string
): Promise<{ connectionId: string; token: string } | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("telegram_connections")
    .select("id, token_ciphertext, owner_telegram_id")
    .eq("user_id", userId)
    .maybeSingle();

  const row = data as {
    id: string;
    token_ciphertext: string;
    owner_telegram_id: number | null;
  } | null;
  if (!row) return null;

  try {
    return { connectionId: row.id, token: decryptTelegramToken(row.token_ciphertext) };
  } catch {
    return null;
  }
};

/**
 * List the owner + admins who should receive a support request notification
 * for this connection. Returns an array of { telegram_id, display_name }.
 * The owner (owner_telegram_id on telegram_connections) is first, then any
 * bot_admins. Returns empty array if the owner hasn't linked their Telegram.
 *
 * `connectionId` is always a TELEGRAM connection id, even for an Instagram
 * conversation — see `resolveNotifierBot` for why.
 */
export const listNotificationRecipients = async (
  connectionId: string
): Promise<Array<{ telegram_id: number; display_name: string | null }>> => {
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("telegram_connections")
    .select("owner_telegram_id")
    .eq("id", connectionId)
    .maybeSingle();

  const recipients: Array<{ telegram_id: number; display_name: string | null }> = [];
  const ownerTelegramId = (connection as { owner_telegram_id: number | null } | null)?.owner_telegram_id;
  if (ownerTelegramId) {
    recipients.push({ telegram_id: ownerTelegramId, display_name: "owner" });
  }

  const { data: adminRows } = await admin
    .from("bot_admins")
    .select("admin_telegram_id, admin_display_name")
    .eq("telegram_connection_id", connectionId);

  for (const row of (adminRows as Array<{
    admin_telegram_id: number;
    admin_display_name: string | null;
  }> | null) ?? []) {
    if (!recipients.some((r) => r.telegram_id === row.admin_telegram_id)) {
      recipients.push({
        telegram_id: row.admin_telegram_id,
        display_name: row.admin_display_name,
      });
    }
  }

  return recipients;
};

/**
 * Check whether a Telegram numeric id is the owner or an admin for this
 * connection. Used by the webhook to decide if an incoming message is an
 * admin action (pending reply) or a customer message.
 */
export const isAdminForConnection = async (
  connectionId: string,
  telegramId: number
): Promise<boolean> => {
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("telegram_connections")
    .select("owner_telegram_id")
    .eq("id", connectionId)
    .maybeSingle();

  const ownerTelegramId = (connection as { owner_telegram_id: number | null } | null)?.owner_telegram_id;
  if (ownerTelegramId === telegramId) return true;

  const { count } = await admin
    .from("bot_admins")
    .select("id", { count: "exact", head: true })
    .eq("telegram_connection_id", connectionId)
    .eq("admin_telegram_id", telegramId);

  return (count ?? 0) > 0;
};
