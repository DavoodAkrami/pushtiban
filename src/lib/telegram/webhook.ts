import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptTelegramToken } from "@/lib/telegram/token-crypto";

const TELEGRAM_TIMEOUT_MS = 8_000;

const publicWebhookUrl = (requestUrl: string, botId: string) => {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const baseUrl = configuredSiteUrl || new URL(requestUrl).origin;
  const webhookUrl = new URL(
    `/api/telegram/webhook/${encodeURIComponent(botId)}`,
    baseUrl
  );

  if (webhookUrl.protocol !== "https:") return null;
  return webhookUrl.toString();
};

const setTelegramWebhook = async ({
  botId,
  requestUrl,
  secret,
  token,
}: {
  botId: string;
  requestUrl: string;
  secret: string;
  token: string;
}) => {
  const url = publicWebhookUrl(requestUrl, botId);
  if (!url) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          secret_token: secret,
          allowed_updates: ["message"],
          drop_pending_updates: false,
        }),
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (!response.ok) return false;

    const result = (await response.json()) as { ok?: boolean };
    return result.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

export const activateTelegramWebhook = async ({
  connectionId,
  requestUrl,
  userId,
}: {
  connectionId: string;
  requestUrl: string;
  userId: string;
}) => {
  const admin = createAdminClient();
  const { data: connection, error } = await admin
    .from("telegram_connections")
    .select("bot_id, token_ciphertext, webhook_secret")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !connection) return false;

  const secret =
    connection.webhook_secret || randomBytes(32).toString("base64url");

  if (!connection.webhook_secret) {
    const { error: secretError } = await admin
      .from("telegram_connections")
      .update({ webhook_secret: secret })
      .eq("id", connectionId)
      .eq("user_id", userId);
    if (secretError) return false;
  }

  let token = "";
  try {
    token = decryptTelegramToken(connection.token_ciphertext);
  } catch {
    await admin
      .from("telegram_connections")
      .update({ status: "error" })
      .eq("id", connectionId);
    return false;
  }

  const active = await setTelegramWebhook({
    botId: connection.bot_id,
    requestUrl,
    secret,
    token,
  });

  await admin
    .from("telegram_connections")
    .update({ status: active ? "active" : "error" })
    .eq("id", connectionId)
    .eq("user_id", userId);

  return active;
};
