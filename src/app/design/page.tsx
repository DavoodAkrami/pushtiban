import type { Metadata } from "next";
import { DesignGallery } from "./gallery";

export const metadata: Metadata = {
  title: "سیستم طراحی — پشتیبان",
  description: "مرجع کامپوننت‌های رابط کاربری پشتیبان",
};

export default function DesignPage() {
  return <DesignGallery />;
}
