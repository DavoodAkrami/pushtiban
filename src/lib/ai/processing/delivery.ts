import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import {
  currentProcessing,
  leaseArgs,
  operationKey,
  processingRpc,
} from "./context";
import { ProcessingFailure } from "./failures";

type Delivery = {
  id: string;
  state: string;
  dispatch: boolean;
  platform_message_id: string | null;
  request_ciphertext: string | null;
};
export type SendResult = { ok: boolean; messageId: string | null };
/** A timeout/5xx/malformed acknowledgement cannot prove a send was rejected. */
export const classifyDelivery = (
  status: number,
  accepted: boolean,
  retrySafe: boolean,
) => {
  if (accepted) return "delivered";
  if (status === 429) return "retryable_failed";
  if (status >= 400 && status < 500) return "permanently_failed";
  return retrySafe ? "retryable_failed" : "unknown";
};
export const deliver = async ({
  channel,
  type,
  key,
  request,
  retrySafe = false,
  send,
}: {
  channel: "telegram" | "instagram";
  type: string;
  key?: string;
  request: unknown;
  retrySafe?: boolean;
  send: () => Promise<{
    status: number;
    accepted: boolean;
    messageId?: string | null;
  }>;
}): Promise<SendResult> => {
  const c = currentProcessing();
  let d: Delivery | undefined;
  if (c) {
    d = await processingRpc<Delivery>("ai_delivery_begin", {
      ...leaseArgs(),
      p_key: key ?? operationKey(`delivery:${type}`),
      p_channel: channel,
      p_type: type,
      p_request: encryptSecret(JSON.stringify(request)),
      p_retry_safe: retrySafe,
    });
    // A replayed handler may encounter changed menus or routing. Never reuse
    // an ordinal delivery key for different content or a different recipient.
    // Progress creation deliberately reuses its known ID across stage changes.
    if (
      type !== "progress" &&
      (!d.request_ciphertext ||
        decryptSecret(d.request_ciphertext) !== JSON.stringify(request))
    ) {
      if (d.dispatch)
        await processingRpc("ai_delivery_finish", {
          ...leaseArgs(),
          p_id: d.id,
          p_state: "permanently_failed",
          p_message_id: null,
          p_category: "replay_unavailable",
        });
      const failure = new ProcessingFailure("replay_unavailable");
      c.poison = failure;
      throw failure;
    }
    if (!d.dispatch) {
      if (d.state === "unknown" || d.state === "sending") {
        const failure = new ProcessingFailure("delivery_unknown");
        if (type !== "progress") c.poison = failure;
        throw failure;
      }
      return { ok: d.state === "delivered", messageId: d.platform_message_id };
    }
  }
  let result: Awaited<ReturnType<typeof send>>;
  try {
    result = await send();
  } catch {
    result = { status: 0, accepted: false };
  }
  const state = classifyDelivery(result.status, result.accepted, retrySafe);
  if (c && type !== "progress")
    c.deliveryRejected = state === "permanently_failed";
  const category =
    state === "unknown"
      ? "delivery_unknown"
      : state === "delivered"
        ? null
        : "delivery_failed";
  if (d)
    await processingRpc("ai_delivery_finish", {
      ...leaseArgs(),
      p_id: d.id,
      p_state: state,
      p_message_id: result.messageId ?? null,
      p_category: category,
    });
  if (c && state === "unknown") {
    const failure = new ProcessingFailure("delivery_unknown");
    if (type !== "progress") c.poison = failure;
    throw failure;
  }
  if (c && state === "retryable_failed")
    throw new ProcessingFailure("delivery_failed");
  return { ok: state === "delivered", messageId: result.messageId ?? null };
};
