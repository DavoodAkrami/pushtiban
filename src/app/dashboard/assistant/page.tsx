import type { Metadata } from "next";
import Link from "next/link";
import { Bot, MessageSquareText } from "lucide-react";
import { AssistantPanel } from "@/components/dashboard/assistant-panel";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { isAssistantAiConfigured } from "@/lib/ai/assistant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "دستیار هوش مصنوعی — پشتیبان",
};

const SETUP_ERROR_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);

/**
 * Which channels this business has connected.
 *
 * Read with the service role because both connection tables are policy-free by
 * design — the anon client cannot see them at all. A failure reads as "not
 * connected", which only hides a switch the owner has nothing to apply it to.
 */
const readConnectedChannels = async (userId: string) => {
  try {
    const admin = createAdminClient();
    const [telegram, instagram] = await Promise.all([
      admin
        .from("telegram_connections")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("instagram_connections")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    return {
      telegram: Boolean(telegram.data),
      instagram: Boolean(instagram.data),
    };
  } catch {
    return { telegram: false, instagram: false };
  }
};

type ReplyPipelineData = {
  telegramConnected: boolean;
  telegramUsername: string;
  activeFlows: number;
  preparedReplies: number;
};

/** Read the routing stages shown beside the assistant settings. */
const readReplyPipelineData = async (
  userId: string
): Promise<ReplyPipelineData> => {
  const empty: ReplyPipelineData = {
    telegramConnected: false,
    telegramUsername: "",
    activeFlows: 0,
    preparedReplies: 0,
  };

  try {
    const admin = createAdminClient();
    const countRows = async (table: string, filter?: [string, boolean]) => {
      let query = admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (filter) query = query.eq(filter[0], filter[1]);
      const { count, error } = await query;
      return error ? 0 : (count ?? 0);
    };

    const [telegram, activeFlows, preparedReplies] = await Promise.all([
      admin
        .from("telegram_connections")
        .select("bot_username")
        .eq("user_id", userId)
        .maybeSingle(),
      countRows("automation_flows", ["is_active", true]),
      countRows("telegram_keyword_automations"),
    ]);

    return {
      telegramConnected: Boolean(telegram.data),
      telegramUsername:
        typeof telegram.data?.bot_username === "string"
          ? telegram.data.bot_username
          : "",
      activeFlows,
      preparedReplies,
    };
  } catch {
    return empty;
  }
};

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

  // The per-channel switches arrived with supabase/channel-inbox.sql, later
  // than the table itself, so they are read on their own: a business that has
  // not run that file must still get this page, with the switches absent
  // rather than the whole screen reporting a broken setup.
  const channelResult = user
    ? await supabase
        .from("ai_assistant_settings")
        .select("telegram_enabled, instagram_enabled")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null, error: null };

  const [connected, replyPipeline] = user
    ? await Promise.all([
        readConnectedChannels(user.id),
        readReplyPipelineData(user.id),
      ])
    : [
        { telegram: false, instagram: false },
        {
          telegramConnected: false,
          telegramUsername: "",
          activeFlows: 0,
          preparedReplies: 0,
        },
      ];

  return (
    <>
      <DashboardPageHeader
        icon={Bot}
        title="نمای کلی دستیار"
        description="از اینجا وضعیت واقعی پاسخ‌گویی، کانال‌های فعال و مسیر رسیدن پیام مشتری به دستیار را کنترل کنید."
        action={
          <Link
            href="/dashboard/assistant/test"
            className={buttonVariants({ size: "sm" })}
          >
            <MessageSquareText className="size-4" aria-hidden />
            آزمایش پاسخ
          </Link>
        }
      />
      <AssistantPanel
        initialEnabled={settingsResult.data?.is_enabled === true}
        initialHumanHandoff={
          settingsResult.data?.human_handoff_enabled === true
        }
        // The migration defaults both columns to true, so a row written before
        // they existed answers the same way the database would.
        initialTelegramEnabled={channelResult.data?.telegram_enabled !== false}
        initialInstagramEnabled={channelResult.data?.instagram_enabled !== false}
        channelSwitchesReady={!channelResult.error}
        telegramConnected={connected.telegram}
        instagramConnected={connected.instagram}
        replyPipeline={replyPipeline}
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
