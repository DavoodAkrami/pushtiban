"use client";

import { BookOpen, FileText, HelpCircle } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

const TABS = [
  { href: "/dashboard/knowledge", label: "اطلاعات", icon: BookOpen },
  { href: "/dashboard/knowledge/qa", label: "پرسش و پاسخ", icon: HelpCircle },
  {
    href: "/dashboard/knowledge/sources",
    label: "فایل‌ها و لینک‌ها",
    icon: FileText,
  },
];

export const KnowledgeTabs = () => (
  <PageTabs items={TABS} ariaLabel="بخش‌های دانش دستیار" className="mb-8" />
);
