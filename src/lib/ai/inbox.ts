import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Inbox helpers shared by the Telegram webhook and the website /api/inbox
 * routes. All reads/writes go through the service-role admin client because
 * the webhook is unauthenticated (Telegram hits it directly) and must scope
 * by the owner's user_id which it already has from the connection lookup.
 */

export type SupportConversationRow = {
  id: string;
  telegram_connection_id: string;
  user_id: string;
  customer_telegram_id: number;
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
 * bot, or null. Lets us append a follow-up message to an existing thread
 * instead of opening a new row each time.
 */
const findOpenConversation = async ({
  connectionId,
  customerTelegramId,
}: {
  connectionId: string;
  customerTelegramId: number;
}): Promise<SupportConversationRow | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_conversations")
    .select("*")
    .eq("telegram_connection_id", connectionId)
    .eq("customer_telegram_id", customerTelegramId)
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
  connectionId,
  userId,
  customerTelegramId,
  customerUsername,
  customerDisplayName,
  messageText,
  queuedReason,
}: {
  connectionId: string;
  userId: string;
  customerTelegramId: number;
  customerUsername?: string | null;
  customerDisplayName?: string | null;
  messageText: string;
  queuedReason: SupportConversationRow["queued_reason"];
}): Promise<SupportConversationRow> => {
  const admin = createAdminClient();

  const { data: conversation, error } = await admin
    .from("support_conversations")
    .insert({
      telegram_connection_id: connectionId,
      user_id: userId,
      customer_telegram_id: customerTelegramId,
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
 * Get or create an open conversation for this customer on this bot. Used by
 * the webhook when the customer taps "ask admin" or explicitly requests a
 * human, so we reuse the thread if one exists.
 */
export const upsertConversationForCustomer = async ({
  connectionId,
  userId,
  customerTelegramId,
  customerUsername,
  customerDisplayName,
  messageText,
  queuedReason,
}: {
  connectionId: string;
  userId: string;
  customerTelegramId: number;
  customerUsername?: string | null;
  customerDisplayName?: string | null;
  messageText: string;
  queuedReason: SupportConversationRow["queued_reason"];
}): Promise<SupportConversationRow> => {
  const existing = await findOpenConversation({ connectionId, customerTelegramId });
  if (existing) {
    await appendCustomerMessage({
      conversationId: existing.id,
      messageText,
    });
    return { ...existing, last_customer_message_text: messageText };
  }
  return createSupportConversation({
    connectionId,
    userId,
    customerTelegramId,
    customerUsername,
    customerDisplayName,
    messageText,
    queuedReason,
  });
};

/**
 * Record the owner/admin's reply and deliver it to the customer via the bot.
 * Marks the conversation as answered. Used by both the webhook (Telegram
 * reply flow) and the website /api/inbox/[id]/reply route.
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
 * List the owner + admins who should receive a support request notification
 * for this connection. Returns an array of { telegram_id, display_name }.
 * The owner (owner_telegram_id on telegram_connections) is first, then any
 * bot_admins. Returns empty array if the owner hasn't linked their Telegram.
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
