import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { encryptSecret, decryptSecret } from "../../crypto/secret-box";
import type { Run } from "../runtime/contracts";
import { ProcessingFailure } from "./failures";

export type ProcessingEvent = {
  id: string;
  user_id: string;
  conversation_id: string;
  channel: "telegram" | "instagram" | "preview";
  connection_id: string;
  external_id: string;
  event_type: string;
  attempts: number;
  replayable: boolean;
  payload_ciphertext: string | null;
  received_at: string;
};
export type ProcessingRun = {
  id: string;
  runtime: Run | null;
  checkpoints: Record<string, unknown>;
  action_execution_id: string | null;
};
export type ProcessingContext = {
  event: ProcessingEvent;
  run: ProcessingRun;
  token: string;
  deliveryRejected?: boolean;
  writes?: Promise<void>;
  counters: Record<string, number>;
  runtimeKey?: string;
  poison?: ProcessingFailure;
};
const storage = new AsyncLocalStorage<ProcessingContext>();
export const currentProcessing = () => storage.getStore();
export const withProcessing = <T>(
  context: ProcessingContext,
  task: () => Promise<T>,
) => storage.run(context, task);
export const operationKey = (namespace: string) => {
  const c = currentProcessing();
  if (!c) return namespace;
  const index = c.counters[namespace] ?? 0;
  c.counters[namespace] = index + 1;
  return `${namespace}:${index}`;
};
export const processingRpc = async <T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> => {
  const c = currentProcessing();
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error) {
      const category = /lease_conflict/.test(error.message)
        ? "lease_conflict"
        : /quota_/.test(error.message)
          ? "quota_exceeded"
          : /authorization_denied/.test(error.message)
            ? "authorization_denied"
            : /budget_reset/.test(error.message)
              ? "budget_exhausted"
              : "database_unavailable";
      throw new ProcessingFailure(category);
    }
    return data as T;
  } catch (error) {
    const failure =
      error instanceof ProcessingFailure
        ? error
        : new ProcessingFailure("database_unavailable");
    if (c) c.poison = failure;
    throw failure;
  }
};
export const leaseArgs = () => {
  const c = currentProcessing();
  if (!c) throw new ProcessingFailure("lease_conflict");
  if (c.poison) throw c.poison;
  return { p_event_id: c.event.id, p_token: c.token };
};
export const assertLease = async () => {
  if (currentProcessing())
    await processingRpc("ai_processing_assert", leaseArgs());
};
export const updateProcessing = async (patch: Record<string, unknown>) => {
  const c = currentProcessing();
  if (!c) return;
  const snapshot = structuredClone(patch);
  const write = (c.writes ?? Promise.resolve()).then(async () => {
    c.run = await processingRpc<ProcessingRun>("ai_processing_update", {
      ...leaseArgs(),
      p_patch: snapshot,
    });
  });
  c.writes = write;
  await write;
};
export const persistBudget = async (run: Run | undefined) => {
  if (run && currentProcessing()) await updateProcessing({ runtime: run });
};
export const trace = async (
  stage: string,
  metadata: {
    provider?: string;
    model?: string;
    capability?: string;
    failure_category?: string;
  } = {},
) => updateProcessing({ stage, ...metadata });
export const readCheckpoint = <T>(key: string): T | undefined => {
  const value = currentProcessing()?.run.checkpoints[key];
  if (typeof value !== "string") return undefined;
  return JSON.parse(decryptSecret(value)) as T;
};
export const writeCheckpoint = async (key: string, value: unknown) =>
  updateProcessing({
    checkpoint_key: key,
    checkpoint_value: encryptSecret(JSON.stringify(value)),
  });
