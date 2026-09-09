import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, SlidersHorizontal } from "lucide-react";
import { AssistantPreviewPane } from "@/components/dashboard/assistant/preview-pane";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { isAssistantAiConfigured } from "@/lib/ai/assistant";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "آزمایش پاسخ دستیار — پشتیبان",
};

const AssistantTestPage = async () => {
  const supabase = await createClient();
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

  return (
    <>
      <DashboardPageHeader
        icon={MessageSquareText}
        title="آزمایش پاسخ"
        description="یک پیام واقعی مشتری را شبیه‌سازی کنید، پاسخ نهایی را ببینید و بررسی کنید دستیار از چه اطلاعاتی استفاده کرده است."
        action={
          <Link
            href="/dashboard/assistant"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            تنظیمات دستیار
          </Link>
        }
      />
      <AssistantPreviewPane
        enabled={settingsResult.data?.is_enabled === true}
        providerConfigured={isAssistantAiConfigured()}
        loadError={Boolean(settingsResult.error)}
      />
    </>
  );
};

export default AssistantTestPage;
