import type { Metadata } from "next";
import { AdminBusinessesPanel } from "@/components/dashboard/admin-panel";

export const metadata: Metadata = {
  title: "کسب‌وکارها — پشتیبان",
  description: "مدیریت کسب‌وکارهای ثبت‌نام‌شده و محدودیت‌های مصرف.",
};

const AdminBusinessesPage = () => <AdminBusinessesPanel />;

export default AdminBusinessesPage;
