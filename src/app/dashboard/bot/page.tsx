import type { Metadata } from "next";
import { Send } from "lucide-react";
import { ConnectionFlow } from "@/components/dashboard/bot/connection-flow";
import { DashboardPageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = {
  title: "ربات تلگرام — پشتیبان",
  description: "اتصال ربات تلگرام کسب‌وکار شما به پشتیبان.",
};

const BotConnectionPage = () => (
  <>
    <DashboardPageHeader
      icon={Send}
      title="اتصال و وضعیت"
      description="ربات تلگرام شما دروازهٔ همهٔ گفتگوهاست؛ تا وصل نشود، فلوها، کلیدواژه‌ها و دستیار هیچ پیامی نمی‌فرستند."
    />
    <div className="rounded-3xl border border-line bg-surface/35 p-5 sm:p-6">
      <ConnectionFlow />
    </div>
  </>
);

export default BotConnectionPage;
