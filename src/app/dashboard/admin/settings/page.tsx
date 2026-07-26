import type { Metadata } from "next";
import { AdminSettingsPanel } from "@/components/dashboard/admin-panel";

export const metadata: Metadata = {
  title: "تنظیمات هوش مصنوعی — پشتیبان",
  description: "تنظیمات سراسری هوش مصنوعی پلتفرم.",
};

const AdminSettingsPage = () => <AdminSettingsPanel />;

export default AdminSettingsPage;
