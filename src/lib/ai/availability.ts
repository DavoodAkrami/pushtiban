import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AssistantAvailabilityChannel = "telegram" | "instagram";

/**
 * The live channel and action paths must share one fail-closed decision. A
 * channel switch is a safety control, so an unreadable setting cannot grant a
 * new model call or confirm a pending mutation.
 */
export const isAssistantChannelEnabled = async ({
  channel,
  userId,
}: {
  channel: AssistantAvailabilityChannel;
  userId: string;
}): Promise<boolean> => {
  try {
    const admin = createAdminClient();
    const [globalResult, assistantResult] = await Promise.all([
      admin
        .from("ai_global_settings")
        .select("ai_enabled")
        .eq("id", 1)
        .maybeSingle(),
      admin
        .from("ai_assistant_settings")
        .select("is_enabled, telegram_enabled, instagram_enabled")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (
      globalResult.error ||
      assistantResult.error ||
      globalResult.data?.ai_enabled !== true ||
      assistantResult.data?.is_enabled !== true
    ) {
      return false;
    }

    return channel === "telegram"
      ? assistantResult.data.telegram_enabled !== false
      : assistantResult.data.instagram_enabled !== false;
  } catch {
    return false;
  }
};
