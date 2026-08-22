"use client";

import { Database, Settings2, Waypoints } from "lucide-react";
import { PageTabs } from "@/components/ui/page-tabs";

export const CollectionTabs = ({ collectionId }: { collectionId: string }) => {
  const base = `/dashboard/data/${collectionId}`;
  return (
    <PageTabs
      items={[
        { href: base, label: "رکوردها", icon: Database },
        { href: `${base}/structure`, label: "ساختار و دسترسی", icon: Settings2 },
        { href: `${base}/source`, label: "منبع داده", icon: Waypoints },
      ]}
      ariaLabel="بخش‌های مجموعه داده"
      className="mb-8"
    />
  );
};

