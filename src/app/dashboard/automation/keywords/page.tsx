import type { Metadata } from "next";
import { AutomationPanel } from "@/components/dashboard/automation-panel";

export const metadata: Metadata = {
  title: "پیام‌های آماده — پشتیبان",
};

const AutomationPage = () => <AutomationPanel />;

export default AutomationPage;
