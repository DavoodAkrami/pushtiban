import "server-only";
import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationScope } from "../runtime/store";
import {
  processingRpc,
  withProcessing,
  type ProcessingEvent,
  type ProcessingRun,
  type ProcessingContext,
} from "./context";
import { classifyFailure, ProcessingFailure, retryDelay } from "./failures";

export const receiveEvent = async ({
  scope,
  externalId,
  type,
  order = null,
  payload,
  replayable = true,
}: {
  scope: ConversationScope;
  externalId: string;
  type: string;
  order?: number | null;
  payload: unknown;
  replayable?: boolean;
}) =>
  processingRpc<string>("ai_processing_receive", {
    p_scope: scope,
    p_external_id: externalId,
    p_type: type,
    p_order: order,
    p_payload: encryptSecret(JSON.stringify(payload)),
    p_replayable: replayable,
  });

export const processEvent = async (
  eventId: string,
  immediate?: () => Promise<unknown>,
) => {
  const token = randomUUID();
  const claimed = await processingRpc<{
    event: ProcessingEvent;
    run: ProcessingRun;
  } | null>("ai_processing_claim", { p_event_id: eventId, p_token: token });
  if (!claimed) return { claimed: false };
  const c: ProcessingContext = { ...claimed, token, counters: {} };
  await withProcessing(c, async () => {
    try {
      if (!claimed.event.replayable && claimed.event.attempts > 1)
        throw new ProcessingFailure("replay_unavailable");
      let response: unknown;
      if (immediate) response = await immediate();
      else {
        if (!claimed.event.replayable || !claimed.event.payload_ciphertext)
          throw new ProcessingFailure("replay_unavailable");
        const payload = JSON.parse(
          decryptSecret(claimed.event.payload_ciphertext),
        );
        if (claimed.event.channel === "telegram") {
          const { processTelegramEvent } = await import(
            "@/lib/telegram/processor"
          );
          response = await processTelegramEvent(
            claimed.event.connection_id,
            payload,
          );
        } else if (claimed.event.channel === "instagram") {
          const { processInstagramEvent } = await import(
            "@/lib/instagram/processor"
          );
          await processInstagramEvent(claimed.event.connection_id, payload);
        } else throw new ProcessingFailure("replay_unavailable");
      }
      if (c.poison) throw c.poison;
      if (response instanceof Response && response.status >= 500)
        throw new ProcessingFailure(
          response.status === 503
            ? "database_unavailable"
            : c.deliveryRejected
              ? "action_validation_failed"
              : "delivery_failed",
        );
      await processingRpc("ai_processing_finish", {
        p_event_id: eventId,
        p_token: token,
        p_state: "completed",
        p_category: null,
        p_delay: 5,
      });
    } catch (error) {
      const category = classifyFailure(error);
      const delay = retryDelay(category, claimed.event.attempts);
      // Use explicit args: a failed write poisons further execution, but we can
      // still try to record the failure. An expired owner cannot finish.
      await processingRpc("ai_processing_finish", {
        p_event_id: eventId,
        p_token: token,
        p_state:
          category === "delivery_unknown"
            ? "delivery_unknown"
            : delay !== null
              ? "retryable_failed"
              : "permanently_failed",
        p_category: category,
        p_delay: delay ?? 0,
      }).catch(() => undefined);
    }
  });
  return { claimed: true };
};

/** External scheduler calls this endpoint; after() only accelerates first work. */
export const recoverEvents = async () => {
  const { recoverTelegramProgress } = await import(
    "@/lib/telegram/progress-recovery"
  );
  await recoverTelegramProgress();
  await processingRpc("ai_processing_cleanup", {});
  const { data, error } = await createAdminClient()
    .from("ai_inbound_events")
    .select("id")
    .in("state", ["ready", "retryable_failed", "processing"])
    .lte("available_at", new Date().toISOString())
    .or(`state.neq.processing,lease_until.lt.${new Date().toISOString()}`)
    .order("receipt_sequence")
    .limit(30);
  if (error) throw new ProcessingFailure("database_unavailable");
  const started = Date.now();
  let claimed = 0;
  for (const row of data ?? []) {
    if (Date.now() - started > 50_000) break;
    if ((await processEvent(row.id)).claimed) {
      claimed++;
      break;
    }
  }
  return { claimed };
};
