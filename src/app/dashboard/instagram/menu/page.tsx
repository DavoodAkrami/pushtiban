import type { Metadata } from "next";
import { InstagramMenuPanel } from "@/components/dashboard/instagram/menu-panel";

export const metadata: Metadata = {
  title: "منوی دایرکت — پشتیبان",
  description:
    "سوال‌های آماده (ice breakers) و منوی ثابت دایرکت اینستاگرام.",
};

export const dynamic = "force-dynamic";

const InstagramMenuPage = () => <InstagramMenuPanel />;

export default InstagramMenuPage;
