"use client";

import { GitBranch, MessageCircle, MessageSquareText } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

const TABS = [
  { href: "/dashboard/automation", label: "فلوها", icon: GitBranch },
  {
    href: "/dashboard/automation/keywords",
    label: "کلیدواژه‌ها و فرمان‌ها",
    icon: MessageSquareText,
  },
  {
    // Comments and story triggers share a tab: both are Instagram-only, and
    // both end in the same place — a direct message to the customer.
    href: "/dashboard/automation/comments",
    label: "کامنت و استوری",
    icon: MessageCircle,
  },
];

export const AutomationTabs = () => (
  <PageTabs items={TABS} ariaLabel="بخش‌های اتوماسیون" className="mb-8" />
);
