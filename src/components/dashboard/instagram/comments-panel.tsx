"use client";

import { InstagramRulesPanel } from "@/components/dashboard/instagram/rules-panel";

export const InstagramCommentsPanel = () => (
  <InstagramRulesPanel
    emptyTitle="هیچ قانونی برای کامنت‌ها وجود ندارد"
    emptyDescription="اولین قانون را بسازید تا وقتی مشتری عبارات مشخصی را در کامنت بنویسد، به‌صورت خودکار دایرکت دریافت کند."
    scope="comment"
  />
);