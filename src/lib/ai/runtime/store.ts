import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionScopeFor, type ActionExecutionContext } from "../actions/core";
import type { Conversation, TaskDraft, ConversationMode } from "./contracts";
export type ConversationScope = {
  userId: string;
  channel: "telegram" | "instagram" | "preview";
  connectionId: string;
  customerIdentityHash: string;
  conversationKeyHash: string;
};
export const conversationScope = (
  context: ActionExecutionContext,
): ConversationScope => actionScopeFor(context);
export const previewScope = (
  userId: string,
  session: string,
): ConversationScope => ({
  userId,
  channel: "preview",
  connectionId: userId,
  customerIdentityHash: createHash("sha256")
    .update(`preview:${userId}`)
    .digest("hex"),
  conversationKeyHash: createHash("sha256")
    .update(`preview:${userId}:${session}`)
    .digest("hex"),
});
export type ConversationStore = {
  load: (scope: ConversationScope) => Promise<Conversation>;
  save: (
    scope: ConversationScope,
    previous: Conversation,
    draft: TaskDraft | null,
    mode?: ConversationMode,
  ) => Promise<Conversation>;
};
export const conversationStore: ConversationStore = {
  load: async (scope) => {
    const { data, error } = await createAdminClient().rpc("ai_runtime_load", {
      p_user_id: scope.userId,
      p_channel: scope.channel,
      p_connection_id: scope.connectionId,
      p_customer_hash: scope.customerIdentityHash,
      p_conversation_hash: scope.conversationKeyHash,
    });
    if (error || !data) throw new Error("runtime_state_unavailable");
    return data as Conversation;
  },
  save: async (scope, previous, draft, mode = previous.mode) => {
    const { data, error } = await createAdminClient().rpc("ai_runtime_save", {
      p_user_id: scope.userId,
      p_id: previous.id,
      p_revision: previous.revision,
      p_draft: draft,
      p_mode: mode,
    });
    if (error || !data) throw new Error("runtime_state_conflict");
    return data as Conversation;
  },
};
