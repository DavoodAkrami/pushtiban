import "server-only";
import { randomUUID } from "node:crypto";
import {
  currentProcessing,
  leaseArgs,
  processingRpc,
  updateProcessing,
} from "./context";
import type { Run } from "../runtime/contracts";

export const reserveUsage = async (
  run: Run | undefined,
  kind: "chat" | "intent" | "embedding",
  provider: string,
  model: string,
  tokens: number,
) => {
  const c = currentProcessing();
  if (!c) return null;
  // Budget counters are committed before the paid call. Unknown usage retains
  // this conservative reservation; the next attempt gets a different call ID.
  await updateProcessing({
    runtime: run,
    stage: kind === "embedding" ? "embedding_started" : "model_started",
    provider,
    model,
  });
  return processingRpc<string>("ai_usage_reserve", {
    ...leaseArgs(),
    p_user_id: c.event.user_id,
    p_run_id: c.run.id,
    p_key: `${c.run.id}:${randomUUID()}`,
    p_kind: kind,
    p_provider: provider,
    p_model: model,
    p_tokens: tokens,
  });
};
export const reconcileUsage = async (
  id: string | null,
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null,
) => {
  if (!id) return;
  await processingRpc("ai_usage_reconcile", {
    p_id: id,
    p_input: usage?.prompt_tokens ?? null,
    p_output: usage?.completion_tokens ?? null,
    p_cached: usage?.prompt_tokens_details?.cached_tokens ?? null,
  });
};
