import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { ActionSettingsPanel } from "@/components/dashboard/action-settings-panel";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button-variants";

export const metadata: Metadata = {
  title: "اقدامات هوش مصنوعی — پشتیبان",
};

const ActionSettingsPage = () => (
  <>
    <DashboardPageHeader
      icon={ShieldCheck}
      title="اقدامات هوش مصنوعی"
      description="مشخص کنید دستیار برای کسب‌وکار شما چه کارهایی می‌تواند انجام دهد."
      action={
        <Link
          href="/dashboard/assistant/test"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <MessageSquareText className="size-4" aria-hidden />
          آزمایش پاسخ
        </Link>
      }
    />
    <ActionSettingsPanel />
  </>
);

export default ActionSettingsPage;
