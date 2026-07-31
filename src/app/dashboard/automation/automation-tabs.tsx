"use client";

import { GitBranch, MessageSquareText } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

const TABS = [
  { href: "/dashboard/automation", label: "فلوها", icon: GitBranch },
  {
    href: "/dashboard/automation/keywords",
    label: "کلیدواژه‌ها و فرمان‌ها",
    icon: MessageSquareText,
  },
];

export const AutomationTabs = () => (
  <PageTabs items={TABS} ariaLabel="بخش‌های اتوماسیون" className="mb-8" />
);
