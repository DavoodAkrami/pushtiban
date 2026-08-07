"use client";

import { Link2, LayoutGrid } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

const TABS = [
  { href: "/dashboard/instagram", label: "اتصال و وضعیت", icon: Link2 },
  { href: "/dashboard/instagram/menu", label: "منوی دایرکت", icon: LayoutGrid },
];

export const InstagramTabs = () => (
  <PageTabs items={TABS} ariaLabel="بخش‌های اینستاگرام" className="mb-8" />
);
