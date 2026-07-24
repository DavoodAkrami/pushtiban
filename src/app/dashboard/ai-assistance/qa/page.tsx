import type { Metadata } from "next";
import { QaPanel } from "@/components/dashboard/ai-assistance-panel";

export const metadata: Metadata = {
  title: "پرسش و پاسخ — پشتیبان",
  description: "مدیریت پرسش‌های متداول و پاسخ دقیق آن‌ها.",
};

const QaPage = () => <QaPanel />;

export default QaPage;
