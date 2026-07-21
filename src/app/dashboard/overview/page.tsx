import type { Metadata } from "next";
import {
  BookOpen,
  MessagesSquare,
  ThumbsUp,
  Timer,
} from "lucide-react";
import { fa } from "@/lib/utils";
import { OverviewCta } from "./overview-cta";

export const metadata: Metadata = {
  title: "نمای کلی — پشتیبان",
};

const STATS = [
  { icon: MessagesSquare, label: "گفتگوهای امروز", value: 0 },
  { icon: Timer, label: "میانگین زمان پاسخ", value: "—" },
  { icon: ThumbsUp, label: "رضایت مشتریان", value: "—" },
  { icon: BookOpen, label: "منابع دانش", value: 0 },
];

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-black">نمای کلی</h1>
        <p className="mt-2 text-sm leading-7 text-muted">
          خلاصه‌ای از وضعیت دستیار هوشمند شما — با اتصال اولین منبع دانش، این
          صفحه زنده می‌شود.
        </p>
      </header>

      <section aria-label="آمار کلی" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-3xl border border-line bg-surface/40 p-5"
          >
            <s.icon className="size-5 text-muted" aria-hidden />
            <p className="mt-4 text-2xl font-black">
              {typeof s.value === "number" ? fa(s.value) : s.value}
            </p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <OverviewCta />
    </div>
  );
}
