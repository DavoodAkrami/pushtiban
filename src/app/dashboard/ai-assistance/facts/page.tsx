import type { Metadata } from "next";
import { FactsPanel } from "@/components/dashboard/ai-assistance-panel";

export const metadata: Metadata = {
  title: "اطلاعات کسب‌وکار — پشتیبان",
  description: "مدیریت اطلاعات پایه‌ای که هوش مصنوعی همیشه می‌داند.",
};

const FactsPage = () => <FactsPanel />;

export default FactsPage;
