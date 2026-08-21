import type { Metadata } from "next";
import { BusinessDataIndexPanel } from "@/components/dashboard/business-data/index-panel";

export const metadata: Metadata = {
  title: "داده‌های کسب‌وکار — پشتیبان",
  description: "مدیریت مجموعه‌های ساخت‌یافته و رکوردهای کسب‌وکار.",
};

const BusinessDataPage = () => (
  <div className="mx-auto max-w-5xl">
    <BusinessDataIndexPanel />
  </div>
);

export default BusinessDataPage;

