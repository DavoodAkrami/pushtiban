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

  const { data, error } = user
    ? await supabase
        .from("ai_assistant_settings")
        .select("is_enabled")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null, error: null };

  return (
    <AiAssistancePanel
      initialEnabled={data?.is_enabled === true}
      loadError={Boolean(error)}
      providerConfigured={isTelegramAiConfigured()}
      setupRequired={Boolean(error && SETUP_ERROR_CODES.has(error.code))}
    />
  );
};

export default AiAssistancePage;
