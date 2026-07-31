import type { Metadata } from "next";
import { SourcesPanel } from "@/components/dashboard/knowledge/sources-panel";

export const metadata: Metadata = {
  title: "فایل‌ها و لینک‌ها — پشتیبان",
  description: "سندها و صفحه‌هایی که دستیار هنگام نیاز در آن‌ها جستجو می‌کند.",
};

const SourcesPage = () => <SourcesPanel />;

export default SourcesPage;
