"use client";

import { LayoutGrid, Link2, Users } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

const TABS = [
  { href: "/dashboard/bot", label: "اتصال و وضعیت", icon: Link2 },
  { href: "/dashboard/bot/admins", label: "ادمین‌ها و ارجاع", icon: Users },
  { href: "/dashboard/bot/menu", label: "منوی ربات", icon: LayoutGrid },
];

export const BotTabs = () => (
  <PageTabs items={TABS} ariaLabel="بخش‌های ربات تلگرام" className="mb-8" />
);
