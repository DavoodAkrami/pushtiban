import type { Metadata } from "next";
import { InstagramComingSoonNotice } from "@/components/dashboard/instagram/notices";
import { InstagramCommentsPanel } from "@/components/dashboard/instagram/comments-panel";

export const metadata: Metadata = {
  title: "کامنت و استوری — پشتیبان",
  description:
    "پاسخ خودکار به کامنت‌های اینستاگرام و تعامل‌های استوری، به‌صورت دایرکت.",
};

export const dynamic = "force-dynamic";

const InstagramCommentsPage = () => (
  <div className="space-y-5">
    <InstagramComingSoonNotice />
    <InstagramCommentsPanel />
  </div>
);

export default InstagramCommentsPage;
