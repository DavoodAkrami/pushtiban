import type { Metadata } from "next";
import { TbBrandInstagram } from "react-icons/tb";
import { InstagramConnectionFlow } from "@/components/dashboard/instagram/connection-flow";
import { DashboardPageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = {
  title: "اینستاگرام — پشتیبان",
  description: "اتصال حساب تجاری اینستاگرام کسب‌وکار شما به پشتیبان.",
};

const InstagramConnectionPage = () => (
  <>
    <DashboardPageHeader
      icon={TbBrandInstagram}
      title="اتصال اینستاگرام"
      description="حساب تجاری اینستاگرام‌تان را وصل کنید تا پشتیبان بتواند دایرکت‌های مشتری‌ها را بخواند. پاسخ‌گویی خودکار در قدم بعد اضافه می‌شود."
    />
    <div className="rounded-3xl border border-line bg-surface/35 p-5 sm:p-6">
      <InstagramConnectionFlow returnTo="instagram" />
    </div>
  </>
);

export default InstagramConnectionPage;
