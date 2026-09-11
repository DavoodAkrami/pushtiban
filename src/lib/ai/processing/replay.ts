import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssistantChannelEnabled } from "../availability";
import type { AssistantResult } from "../assistant";
import { currentProcessing } from "./context";
import { ProcessingFailure } from "./failures";
/** Cached generation carries no authority: delivery still checks current controls. */
export const authorizeReplay = async (result: AssistantResult) => {
  const c = currentProcessing();
  if (!c || c.event.channel === "preview") return;
  if (
    !(await isAssistantChannelEnabled({
      userId: c.event.user_id,
      channel: c.event.channel,
    }))
  )
    throw new ProcessingFailure("authorization_denied");
  const { data: conversation, error } = await createAdminClient()
    .from("ai_runtime_conversations")
    .select("mode,draft")
    .eq("id", c.event.conversation_id)
    .eq("user_id", c.event.user_id)
    .maybeSingle();
  if (error) throw new ProcessingFailure("database_unavailable");
  if (!conversation || conversation.mode !== "ai_active")
    throw new ProcessingFailure("authorization_denied");
  if (result.action?.status === "pending_confirmation") {
    const { data: action, error } = await createAdminClient()
      .from("business_action_executions")
      .select("status,confirmation_expires_at")
      .eq("id", result.action.executionId)
      .eq("user_id", c.event.user_id)
      .maybeSingle();
    if (error) throw new ProcessingFailure("database_unavailable");
    if (
      !action ||
      action.status !== "pending_confirmation" ||
      !action.confirmation_expires_at ||
      Date.parse(action.confirmation_expires_at) <= Date.now()
    )
      throw new ProcessingFailure("action_validation_failed");
  }
};
