import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OnboardingClient, type BotIdentity } from "./onboarding-client";

export const metadata: Metadata = {
  title: "راه‌اندازی ربات تلگرام — پشتیبان",
  description: "ربات تلگرام‌تان را متصل کنید و پشتیبان را برای کسب‌وکارتان آماده کنید.",
};

const OnboardingPage = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // business_category ships with supabase/onboarding.sql; a missing column
  // must not block the whole screen, so it is read separately.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, business_name, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed_at) redirect("/dashboard/overview");

  const { data: categoryRow } = await supabase
    .from("profiles")
    .select("business_category")
    .eq("id", user.id)
    .maybeSingle();

  let initialBot: BotIdentity | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("telegram_connections")
      .select("bot_id, bot_name, bot_username")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      initialBot = {
        id: data.bot_id,
        name: data.bot_name,
        username: data.bot_username,
      };
    }
  } catch {
    // The setup screen remains available before the server schema is applied.
  }

  return (
    <OnboardingClient
      initialBot={initialBot}
      initialProfile={{
        fullName:
          profile?.full_name ??
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : ""),
        businessName:
          profile?.business_name ??
          (typeof user.user_metadata?.business_name === "string"
            ? user.user_metadata.business_name
            : ""),
        businessCategory:
          typeof categoryRow?.business_category === "string"
            ? categoryRow.business_category
            : "",
      }}
    />
  );
};

export default OnboardingPage;
