import { createHash } from "node:crypto";
import { deliver } from "@/lib/ai/processing/delivery";
const TELEGRAM_TIMEOUT_MS = 8_000;
export const telegramRequest = async (
  token: string,
  method: string,
  body: object,
  progress = false,
) => {
  const ephemeral = method === "answerCallbackQuery";
  const send = async () => {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      },
    );
    const value = await response.json();
    const unchanged =
      method === "editMessageText" &&
      value.error_code === 400 &&
      /message is not modified/i.test(value.description ?? "");
    const removed =
      method === "deleteMessage" &&
      value.error_code === 400 &&
      /message to delete not found/i.test(value.description ?? "");
    return {
      status: value.error_code ?? response.status,
      accepted: (response.ok && value.ok === true) || unchanged || removed,
      messageId: value.result?.message_id
        ? String(value.result.message_id)
        : null,
    };
  };
  if (ephemeral) {
    try {
      const result = await send();
      return { ok: result.accepted, messageId: result.messageId };
    } catch {
      return { ok: false, messageId: null };
    }
  }
  return deliver({
    channel: "telegram",
    type: progress ? "progress" : method,
    key: progress
      ? method === "sendMessage"
        ? "progress:create"
        : `progress:${method}:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}`
      : undefined,
    request: { method, body },
    retrySafe:
      method === "editMessageText" ||
      method === "deleteMessage" ||
      method === "editMessageReplyMarkup",
    send,
  });
};
