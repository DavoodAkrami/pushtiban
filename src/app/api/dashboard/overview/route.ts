import { NextResponse } from "next/server";
import { getBusinessUsageSnapshot } from "@/lib/ai/usage";
import { businessCategoryLabel } from "@/lib/business-categories";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the overview page shows, in one round trip. Every read is
 * independent and best-effort: a table that does not exist yet contributes a
 * zero instead of failing the whole page.
 */
export const GET = async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "نشست شما تمام شده؛ دوباره وارد حساب شوید." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const userId = user.id;

  /** Owner-scoped row count, or 0 when the table is missing. */
  const countRows = async (
    table: string,
    filters: Record<string, string | boolean> = {}
  ): Promise<number> => {
    let query = admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    for (const [column, value] of Object.entries(filters)) {
      query = query.eq(column, value);
    }
    const { count, error } = await query;
    return error ? 0 : (count ?? 0);
  };

  const [
    usage,
    facts,
    qaPairs,
    sources,
    flows,
    activeFlows,
    preparedReplies,
    openConversations,
    totalConversations,
    assistantRes,
    connectionRes,
    profileRes,
  ] = await Promise.all([
    getBusinessUsageSnapshot(userId),
    countRows("ai_knowledge_facts"),
    countRows("ai_knowledge_qa"),
    countRows("knowledge_sources"),
    countRows("automation_flows"),
    countRows("automation_flows", { is_active: true }),
    countRows("telegram_keyword_automations"),
    countRows("support_conversations", { status: "open" }),
    countRows("support_conversations"),
    admin
      .from("ai_assistant_settings")
      .select("is_enabled, human_handoff_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("telegram_connections")
      .select("bot_name, bot_username, owner_telegram_id")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("business_category")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const category =
    typeof profileRes.data?.business_category === "string"
      ? profileRes.data.business_category
      : "";

  return NextResponse.json({
    overview: {
      usage,
      knowledge: { facts, qaPairs, sources },
      automation: { flows, activeFlows, preparedReplies },
      inbox: { openConversations, totalConversations },
      assistant: {
        enabled: assistantRes.data?.is_enabled === true,
        handoffEnabled: assistantRes.data?.human_handoff_enabled === true,
      },
      telegram: {
        connected: Boolean(connectionRes.data),
        botName: (connectionRes.data?.bot_name as string) ?? "",
        botUsername: (connectionRes.data?.bot_username as string) ?? "",
        ownerLinked: Boolean(connectionRes.data?.owner_telegram_id),
      },
      business: {
        category,
        categoryLabel: businessCategoryLabel(category),
      },
    },
  });
};
