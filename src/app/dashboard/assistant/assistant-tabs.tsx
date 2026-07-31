"use client";

import { ToggleRight, Wand2 } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

const TABS = [
  { href: "/dashboard/assistant", label: "وضعیت و رفتار", icon: ToggleRight },
  { href: "/dashboard/assistant/persona", label: "شخصیت و لحن", icon: Wand2 },
];

export const AssistantTabs = () => (
  <PageTabs items={TABS} ariaLabel="بخش‌های دستیار" className="mb-8" />
);
