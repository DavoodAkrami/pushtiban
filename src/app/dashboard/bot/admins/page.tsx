import type { Metadata } from "next";
import { Users } from "lucide-react";
import { InboxSetupSection } from "@/components/dashboard/bot/telegram-admins";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "ادمین‌ها و ارجاع — پشتیبان",
  description: "گیرندگان پیام‌هایی که دستیار به پشتیبان انسانی ارجاع می‌دهد.",
};

const BotAdminsPage = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Telegram connection info for the inbox-in-Telegram setup section. Uses the
  // admin client because telegram_connections has no RLS policies for users.
  let connectionInfo: {
    botId: string | null;
    botUsername: string | null;
    ownerTelegramId: number | null;
  } = { botId: null, botUsername: null, ownerTelegramId: null };

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
    <>
      <DashboardPageHeader
        icon={Users}
        title="ادمین‌ها و ارجاع"
        description="وقتی دستیار پرسشی را به پشتیبان انسانی ارجاع می‌دهد، پیام به این افراد در تلگرام می‌رسد."
      />
      <InboxSetupSection
        botId={connectionInfo.botId}
        botUsername={connectionInfo.botUsername}
        ownerTelegramId={connectionInfo.ownerTelegramId}
      />
    </>
  );
};

export default BotAdminsPage;
