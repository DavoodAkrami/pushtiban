"use client";

import { MessageSquareText, ShieldCheck, ToggleRight, Wand2 } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

const TABS = [
  { href: "/dashboard/assistant", label: "نمای کلی", icon: ToggleRight },
  {
    href: "/dashboard/assistant/test",
    label: "آزمایش پاسخ",
    icon: MessageSquareText,
  },
  { href: "/dashboard/assistant/persona", label: "شخصیت و لحن", icon: Wand2 },
  { href: "/dashboard/assistant/actions", label: "اقدامات", icon: ShieldCheck },
];

export const AssistantTabs = () => (
  <PageTabs items={TABS} ariaLabel="بخش‌های دستیار" className="mb-8" />
);
