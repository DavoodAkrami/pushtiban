import type { Metadata } from "next";
import { AiAssistancePanel } from "@/components/dashboard/ai-assistance-panel";
import { isTelegramAiConfigured } from "@/lib/ai/telegram-assistant";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "دستیار هوش مصنوعی — پشتیبان",
};

const SETUP_ERROR_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);

const AiAssistancePage = async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const settingsResult = user
    ? await supabase
        .from("ai_assistant_settings")
        .select("is_enabled")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null, error: null };

  // Telegram connection info for the inbox-in-Telegram setup section.
  // Fetch the bot_id, bot_username, and owner-linked status. Uses the admin
  // client because telegram_connections has no RLS policies for users.
  let connectionInfo: {
    botId: string | null;
    botUsername: string | null;
    ownerTelegramId: number | null;
  } = {
    botId: null,
    botUsername: null,
    ownerTelegramId: null,
  };
  if (user) {
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    const { data: conn } = await admin
      .from("telegram_connections")
      .select("bot_id, bot_username, owner_telegram_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const c = conn as {
      bot_id: string;
      bot_username: string;
      owner_telegram_id: number | null;
    } | null;
    if (c) {
      connectionInfo = {
        botId: c.bot_id,
        botUsername: c.bot_username,
        ownerTelegramId: c.owner_telegram_id,
      };
    }
  }

  return (
    <AiAssistancePanel
      initialEnabled={settingsResult.data?.is_enabled === true}
      loadError={Boolean(settingsResult.error)}
      providerConfigured={isTelegramAiConfigured()}
      setupRequired={Boolean(
        settingsResult.error && SETUP_ERROR_CODES.has(settingsResult.error.code)
      )}
      botId={connectionInfo.botId}
      botUsername={connectionInfo.botUsername}
      ownerTelegramId={connectionInfo.ownerTelegramId}
    />
  );
};

export default AiAssistancePage;
