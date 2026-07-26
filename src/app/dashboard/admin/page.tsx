import type { Metadata } from "next";
import { AdminUsagePanel } from "@/components/dashboard/admin-panel";

export const metadata: Metadata = {
  title: "مصرف و آمار — پشتیبان",
  description: "مصرف توکن و پیام هوش مصنوعی در کل پلتفرم.",
};

const AdminUsagePage = () => <AdminUsagePanel />;

export default AdminUsagePage;
