import type { Metadata } from "next";
import { MenuPanel } from "@/components/dashboard/menu-panel";

export const metadata: Metadata = {
  title: "منوی ربات — پشتیبان",
  description: "چیدمان دکمه‌های همیشگی پایین صفحهٔ چت ربات تلگرام.",
};

const MenuPage = () => <MenuPanel />;

export default MenuPage;
