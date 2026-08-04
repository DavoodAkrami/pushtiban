import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { AssistantPanel } from "@/components/dashboard/assistant-panel";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { isAssistantAiConfigured } from "@/lib/ai/assistant";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "دستیار هوش مصنوعی — پشتیبان",
};

const SETUP_ERROR_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);

const AssistantPage = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const settingsResult = user
    ? await supabase
        .from("ai_assistant_settings")
        .select("is_enabled, human_handoff_enabled")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null, error: null };

  return (
    <>
      <DashboardPageHeader
        icon={Bot}
        title="وضعیت و رفتار"
        description="دستیار آخرین حلقهٔ پاسخ‌گویی است: هر پیامی که فلوها و کلیدواژه‌ها جواب ندهند به او می‌رسد."
      />
      <AssistantPanel
        initialEnabled={settingsResult.data?.is_enabled === true}
        initialHumanHandoff={
          settingsResult.data?.human_handoff_enabled === true
        }
        loadError={Boolean(settingsResult.error)}
        providerConfigured={isAssistantAiConfigured()}
        setupRequired={Boolean(
          settingsResult.error &&
            SETUP_ERROR_CODES.has(settingsResult.error.code)
        )}
      />
    </>
  );
};

export default AssistantPage;
