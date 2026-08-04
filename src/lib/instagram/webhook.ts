import "server-only";

import { decryptSecret } from "@/lib/crypto/secret-box";
import { subscribeToWebhookFields } from "@/lib/instagram/api";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Arming a connected Instagram account to deliver webhooks.
//
// This is the Instagram counterpart of src/lib/telegram/webhook.ts, with one
// structural difference worth knowing: Telegram is told the callback URL per
// bot, so every connection registers its own address and its own secret.
// Instagram's callback URL and verify token are configured **once**, in the App
// Dashboard, and serve every business on the app. What remains per-account is
// only the field subscription below — without it the account is authorized but
// nothing is ever delivered.
//
// That is also why instagram_connections.webhook_secret is unused: deliveries
// are authenticated with an app-secret HMAC over the raw body, not a
// per-connection token.
// ---------------------------------------------------------------------------

/**
 * The fields the webhook route actually handles. Subscribing to more would mean
 * accepting deliveries we silently drop.
 *
 * - `messages` carries direct messages, story replies and story mentions.
 * - `messaging_postbacks` carries ice breaker and persistent menu taps.
 * - `comments` carries comments on the account's own media.
 */
export const INSTAGRAM_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "comments",
] as const;

/**
 * Subscribe a connection to the webhook fields and record the outcome on the
 * row, so the dashboard can tell "connected" from "connected and listening".
 *
 * Mirrors activateTelegramWebhook: never throws, returns whether the account is
 * live, and writes `status` either way.
 */
export const activateInstagramWebhook = async ({
  connectionId,
  userId,
}: {
  connectionId: string;
  userId: string;
}) => {
  const admin = createAdminClient();
  const { data: connection, error } = await admin
    .from("instagram_connections")
    .select("instagram_user_id, token_ciphertext")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !connection) return false;

  const row = connection as {
    instagram_user_id: string;
    token_ciphertext: string;
  };

  let token = "";
  try {
    token = decryptSecret(row.token_ciphertext);
  } catch {
    // An unreadable token is a dead connection, not a transient failure — say
    // so on the row rather than retrying forever.
    await admin
      .from("instagram_connections")
      .update({ status: "error" })
      .eq("id", connectionId)
      .eq("user_id", userId);
    return false;
  }

  const active = await subscribeToWebhookFields({
    fields: [...INSTAGRAM_WEBHOOK_FIELDS],
    igUserId: row.instagram_user_id,
    token,
  });

  await admin
    .from("instagram_connections")
    .update({ status: active ? "active" : "error" })
    .eq("id", connectionId)
    .eq("user_id", userId);

  return active;
};
