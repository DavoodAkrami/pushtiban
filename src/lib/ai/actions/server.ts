import "server-only";
import { runConversation } from "../runtime/orchestrator";
import { conversationScope } from "../runtime/store";
import type { RunProgressEvent } from "../runtime/contracts";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createActionEngine,
  actionScopeFor,
  type ActionExecutionContext,
  type ActionExecutionStore,
  type ActionHandlingResult,
  type ClaimActionExecutionInput,
  type StoredActionExecution,
} from "./core";
import { ACTION_REGISTRY } from "./registry";
import { getBusinessActionConfiguration } from "./settings";
import { isAssistantChannelEnabled } from "@/lib/ai/availability";

type ExecutionRow = {
  id: string;
  user_id: string;
  action_key: string;
  status: StoredActionExecution["status"];
  channel: StoredActionExecution["channel"];
  connection_id: string;
  customer_identity_hash: string;
  conversation_key_hash: string;
  arguments: unknown;
  result: unknown | null;
  idempotency_key: string;
  requires_verification: boolean;
  requires_confirmation: boolean;
  confirmation_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

const toExecution = (row: ExecutionRow): StoredActionExecution => ({
  id: row.id,
  userId: row.user_id,
  actionKey: row.action_key,
  status: row.status,
  channel: row.channel,
  connectionId: row.connection_id,
  customerIdentityHash: row.customer_identity_hash,
  conversationKeyHash: row.conversation_key_hash,
  arguments: row.arguments,
  result: row.result,
  idempotencyKey: row.idempotency_key,
  requiresVerification: row.requires_verification,
  requiresConfirmation: row.requires_confirmation,
  confirmationExpiresAt: row.confirmation_expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const executionSelect =
  "id, user_id, action_key, status, channel, connection_id, customer_identity_hash, conversation_key_hash, arguments, result, idempotency_key, requires_verification, requires_confirmation, confirmation_expires_at, created_at, updated_at";

const actionStore: ActionExecutionStore = {
  claim: async (input: ClaimActionExecutionInput) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("business_action_executions")
      .insert({
        user_id: input.userId,
        action_key: input.actionKey,
        status: input.status,
        channel: input.channel,
        connection_id: input.connectionId,
        customer_identity_hash: input.customerIdentityHash,
        conversation_key_hash: input.conversationKeyHash,
        arguments: input.arguments,
        idempotency_key: input.idempotencyKey,
        requires_verification: input.requiresVerification,
        requires_confirmation: input.requiresConfirmation,
        confirmation_expires_at: input.confirmationExpiresAt,
        execution_started_at:
          input.status === "executing" ? new Date().toISOString() : null,
      })
      .select(executionSelect)
      .single();
    if (!error && data) {
      return { created: true, execution: toExecution(data as ExecutionRow) };
    }
    if (error?.code !== "23505") {
      throw new Error("Action execution claim failed.");
    }

    const existing = await admin
      .from("business_action_executions")
      .select(executionSelect)
      .eq("user_id", input.userId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing.error || !existing.data) {
      throw new Error("Action execution lookup failed.");
    }
    return {
      created: false,
      execution: toExecution(existing.data as ExecutionRow),
    };
  },
  findByIdempotency: async (userId, idempotencyKey) => {
    const { data, error } = await createAdminClient()
      .from("business_action_executions")
      .select(executionSelect)
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw new Error("Action idempotency lookup failed.");
    return data ? toExecution(data as ExecutionRow) : null;
  },
  findPending: async (scope) => {
    const { data, error } = await createAdminClient()
      .from("business_action_executions")
      .select(executionSelect)
      .eq("user_id", scope.userId)
      .eq("channel", scope.channel)
      .eq("connection_id", scope.connectionId)
      .eq("customer_identity_hash", scope.customerIdentityHash)
      .eq("conversation_key_hash", scope.conversationKeyHash)
      .eq("status", "pending_confirmation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Pending action lookup failed.");
    return data ? toExecution(data as ExecutionRow) : null;
  },
  markExecuting: async (executionId) => {
    const { data, error } = await createAdminClient()
      .from("business_action_executions")
      .update({
        status: "executing",
        execution_started_at: new Date().toISOString(),
      })
      .eq("id", executionId)
      .eq("status", "pending_confirmation")
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Action confirmation claim failed.");
    return Boolean(data);
  },
  claimStaleExecution: async (executionId, previousUpdatedAt) => {
    const { data, error } = await createAdminClient()
      .from("business_action_executions")
      .update({ execution_started_at: new Date().toISOString() })
      .eq("id", executionId)
      .eq("status", "executing")
      .eq("updated_at", previousUpdatedAt)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Action retry claim failed.");
    return Boolean(data);
  },
  markSucceeded: async (executionId, result) => {
    const { data, error } = await createAdminClient()
      .from("business_action_executions")
      .update({
        status: "succeeded",
        result,
        completed_at: new Date().toISOString(),
        failure_code: null,
        failure_reason: null,
      })
      .eq("id", executionId)
      .eq("status", "executing")
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("Action success audit failed.");
  },
  markFailed: async (executionId, failureCode) => {
    const { error } = await createAdminClient()
      .from("business_action_executions")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        failure_code: failureCode.slice(0, 80),
        failure_reason: "Action execution did not complete.",
      })
      .eq("id", executionId)
      .in("status", ["pending_confirmation", "executing"]);
    if (error) throw new Error("Action failure audit failed.");
  },
  markExpired: async (executionId) => {
    const { error } = await createAdminClient()
      .from("business_action_executions")
      .update({
        status: "expired",
        completed_at: new Date().toISOString(),
        failure_code: "confirmation_expired",
        failure_reason: "Action confirmation expired.",
      })
      .eq("id", executionId)
      .eq("status", "pending_confirmation");
    if (error) throw new Error("Action expiration audit failed.");
  },
};

const authorizeContext = async (context: ActionExecutionContext) => {
  const table =
    context.channel === "telegram"
      ? "telegram_connections"
      : "instagram_connections";
  const [connectionResult, assistantEnabled] = await Promise.all([
    createAdminClient()
      .from(table)
      .select("id")
      .eq("id", context.connectionId)
      .eq("user_id", context.userId)
      .maybeSingle(),
    isAssistantChannelEnabled({
      channel: context.channel,
      userId: context.userId,
    }),
  ]);
  return !connectionResult.error && Boolean(connectionResult.data) && assistantEnabled;
};

const verifyCustomer = async (context: ActionExecutionContext) => {
  const scope = actionScopeFor(context);
  const { data, error } = await createAdminClient()
    .from("business_data_verified_customer_sessions")
    .select("id")
    .eq("user_id", context.userId)
    .eq("channel", context.channel)
    .eq("connection_id", context.connectionId)
    .eq("customer_identity_hash", scope.customerIdentityHash)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
};

const actionEngine = createActionEngine({
  definitions: ACTION_REGISTRY,
  store: actionStore,
  authorizeContext,
  verifyCustomer,
  resolveConfiguration: (context, definition) =>
    getBusinessActionConfiguration({ userId: context.userId, definition }),
});

const safeFailure = (actionKey?: string): ActionHandlingResult => ({
  handled: true,
  text: "انجام درخواست ممکن نشد؛ لطفاً کمی بعد دوباره تلاش کنید.",
  actionKey,
  status: "failed",
});

export const executeModelAction = async ({
  context,
  request,
}: {
  context: ActionExecutionContext;
  request: unknown;
}): Promise<ActionHandlingResult> => {
  try {
    return await actionEngine.executeRequested({ context, request });
  } catch {
    console.error("Business action request failed safely.");
    return safeFailure();
  }
};

export const handleActionConfirmation = async ({
  context,
  expectedExecutionId,
  message,
  onProgress,
}: {
  onProgress?: (event: RunProgressEvent) => Promise<void>;
  context: ActionExecutionContext;
  expectedExecutionId?: string;
  message: string;
}): Promise<ActionHandlingResult> => {
  // Non-confirmation text belongs to the planner, not this zero-model path.
  if (!/^(بله|آره|اره|تأیید|تایید|اوکی|yes|ok|نه|خیر|لغو|انصراف|no|cancel|لغو سفارش|لغو درخواست)[.!؟?،,]*$/iu.test(message.trim())) return { handled: false, text: null };
  let handled: ActionHandlingResult = { handled: false, text: null };
  const result = await runConversation({ scope: conversationScope(context), message, onProgress, expectedExecutionId, execute: async () => {
    handled = await actionEngine.confirmPending({ context, expectedExecutionId, message });
    return { text: handled.text, needsHuman: false, action: handled.status ? { key: handled.actionKey, executionId: handled.executionId, status: handled.status } : undefined };
  } });
  if (result.text && !handled.handled) return { handled: true, text: result.text, status: result.action?.status };
  return { ...handled, text: result.text };
};
