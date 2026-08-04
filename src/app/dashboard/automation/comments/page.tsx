import type { Metadata } from "next";
import { InstagramCommentsPanel } from "@/components/dashboard/instagram/comments-panel";

export const metadata: Metadata = {
  title: "کامنت و استوری — پشتیبان",
  description:
    "پاسخ خودکار به کامنت‌های اینستاگرام و تعامل‌های استوری، به‌صورت دایرکت.",
};

// The channel chips read ?channel=, which makes this page request-dependent.
export const dynamic = "force-dynamic";

const InstagramCommentsPage = () => <InstagramCommentsPanel />;

export default InstagramCommentsPage;
