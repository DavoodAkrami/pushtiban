import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { ActionSettingsPanel } from "@/components/dashboard/action-settings-panel";
import { DashboardPageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = {
  title: "اقدامات هوش مصنوعی — پشتیبان",
};

const ActionSettingsPage = () => (
  <>
    <DashboardPageHeader
      icon={ShieldCheck}
      title="اقدامات هوش مصنوعی"
      description="مشخص کنید دستیار برای کسب‌وکار شما چه کارهایی می‌تواند انجام دهد."
    />
    <ActionSettingsPanel />
  </>
);

export default ActionSettingsPage;
