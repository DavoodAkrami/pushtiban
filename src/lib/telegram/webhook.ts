import "server-only";

import { randomBytes } from "node:crypto";
import {
  isValidTelegramCommand,
  TELEGRAM_COMMANDS_MAX_COUNT,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptTelegramToken } from "@/lib/telegram/token-crypto";

const TELEGRAM_TIMEOUT_MS = 8_000;

type TelegramMenuCommand = {
  command: string;
  description: string;
};

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

const updateTelegramCommandMenu = async ({
  commands,
  token,
}: {
  commands: TelegramMenuCommand[];
  token: string;
}) => {
  const method = commands.length > 0 ? "setMyCommands" : "deleteMyCommands";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commands.length > 0 ? { commands } : {}),
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

export const syncTelegramCommandMenu = async ({
  connectionId,
  userId,
}: {
  connectionId: string;
  userId: string;
}) => {
  const admin = createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("telegram_connections")
    .select("token_ciphertext")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (connectionError || !connection) return false;

  const { data, error } = await admin
    .from("telegram_keyword_automations")
    .select("keyword, command_description")
    .eq("telegram_connection_id", connectionId)
    .eq("user_id", userId)
    .eq("trigger_type", "command")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(TELEGRAM_COMMANDS_MAX_COUNT + 1);

  if (error || !data || data.length > TELEGRAM_COMMANDS_MAX_COUNT) return false;

  const commands = data.map((row) => ({
    command: row.keyword.replace(/^\//, ""),
    description: row.command_description?.trim() ?? "",
  }));

  if (
    commands.some(
      (command) =>
        !isValidTelegramCommand(command.command) || !command.description
    )
  ) {
    return false;
  }

  let token = "";
  try {
    token = decryptTelegramToken(connection.token_ciphertext);
  } catch {
    return false;
  }

  return updateTelegramCommandMenu({ commands, token });
};
