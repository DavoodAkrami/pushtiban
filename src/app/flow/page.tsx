import type { Metadata } from "next";
import { FlowsPanel } from "@/components/dashboard/flows-panel";

export const metadata: Metadata = {
  title: "فلوها — پشتیبان",
  description: "ساخت و مدیریت فلوهای تعاملی ربات تلگرام.",
};

const FlowsPage = () => <FlowsPanel />;

export default FlowsPage;
