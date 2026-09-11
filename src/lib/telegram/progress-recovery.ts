import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { processingRpc } from "@/lib/ai/processing/context";
/** Deletion is idempotent. This separate bounded lease also handles terminal runs. */
export const recoverTelegramProgress = async () => {
  const token = randomUUID();
  const item = await processingRpc<{
    connection_id: string;
    delivery: {
      id: string;
      request_ciphertext: string | null;
      platform_message_id: string;
    };
  } | null>("ai_processing_progress_cleanup_claim", { p_token: token });
  if (!item) return;
  let success = false;
  try {
    const { data, error } = await createAdminClient()
      .from("telegram_connections")
      .select("token_ciphertext")
      .eq("id", item.connection_id)
      .maybeSingle();
    if (error || !data || !item.delivery.request_ciphertext) return;
    const { body } = JSON.parse(
      decryptSecret(item.delivery.request_ciphertext),
    );
    const response = await fetch(
      `https://api.telegram.org/bot${decryptSecret(data.token_ciphertext)}/deleteMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: body.chat_id,
          message_id: Number(item.delivery.platform_message_id),
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    const value = await response.json();
    success =
      value.ok === true ||
      (value.error_code === 400 &&
        /message to delete not found/i.test(value.description ?? ""));
  } catch {
    /* The bounded cleanup lease remains observable. */
  } finally {
    await processingRpc("ai_processing_progress_cleanup_finish", {
      p_id: item.delivery.id,
      p_token: token,
      p_success: success,
    });
  }
};
