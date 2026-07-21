"use client";

import {
  BarChart3,
  Bot,
  CheckCheck,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { Parallax } from "@/components/motion/parallax";
import { fa } from "@/lib/utils";

/** Stylized dashboard window built from primitives — no images needed. */
function DashboardMock() {
  return (
    <div className="glass-strong overflow-hidden rounded-3xl shadow-lift">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-line px-5 py-3.5">
        <span className="size-2.5 rounded-full bg-[#FF5F57]" />
        <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="size-2.5 rounded-full bg-[#28C840]" />
        <span className="ms-3 text-xs text-muted">داشبورد پشتیبان</span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        {[
          { icon: Users, label: "مکالمات امروز", value: fa("1348") },
          { icon: CheckCheck, label: "پاسخ خودکار", value: fa("94") + "٪" },
          { icon: TrendingUp, label: "رضایت مشتری", value: fa("4.8") + " از " + fa("5") },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-card/70 p-4">
            <s.icon className="mb-2 size-4 text-accent" aria-hidden />
            <p className="text-xl font-extrabold">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted">{s.label}</p>
          </div>
        ))}
        {/* bar chart */}
        <div className="rounded-2xl bg-card/70 p-4 sm:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold">مکالمات هفته اخیر</p>
            <BarChart3 className="size-4 text-muted" aria-hidden />
          </div>
          <div className="flex h-24 items-end gap-2" aria-hidden>
            {[42, 58, 45, 72, 64, 88, 96].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-accent/25 transition-all duration-500 hover:bg-accent/60"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramMock() {
  return (
    <div className="glass-strong w-64 overflow-hidden rounded-3xl shadow-lift">
      <div className="flex items-center gap-2.5 border-b border-line bg-accent/10 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-white">
          <Send className="size-3.5 -translate-x-px translate-y-px" aria-hidden />
        </span>
        <div className="text-xs">
          <p className="font-bold">پشتیبان تلگرام</p>
          <p className="text-accent">در حال تایپ…</p>
        </div>
      </div>
      <div className="space-y-2.5 p-4 text-xs leading-6">
        <div className="me-6 rounded-xl rounded-tr-sm bg-card px-3 py-2">
          گارانتی این گوشی چند ماهه؟
        </div>
        <div className="ms-6 rounded-xl rounded-tl-sm bg-accent/15 px-3 py-2">
          این مدل ۱۸ ماه گارانتی رسمی شرکتی دارد و تعویض ۷ روزه هم شامل آن
          می‌شود.
        </div>
        <div className="me-6 rounded-xl rounded-tr-sm bg-card px-3 py-2">
          عالیه، موجوده؟
        </div>
        <div className="ms-6 rounded-xl rounded-tl-sm bg-accent/15 px-3 py-2">
          بله، ۱۲ عدد در انبار تهران موجود است و ارسال فردا انجام می‌شود. ✅
        </div>
      </div>
    </div>
  );
}

export function Showcase() {
  return (
    <Section id="showcase" className="overflow-visible">
      <SectionHeading
        eyebrow="نمای محصول"
        title="همه‌چیز زیر نگاه شماست"
        lead="داشبورد تحلیلی، مکالمات زنده تلگرام و عملکرد هوش مصنوعی — همه در یک نما."
      />
      <div className="relative mx-auto max-w-4xl">
        <Reveal>
          <Parallax distance={26}>
            <DashboardMock />
          </Parallax>
        </Reveal>
        <Reveal delay={0.2}>
          <Parallax
            distance={-34}
            className="pointer-events-none absolute -bottom-14 -left-2 hidden md:block lg:-left-16"
          >
            <div className="pointer-events-auto">
              <TelegramMock />
            </div>
          </Parallax>
        </Reveal>
        <Reveal delay={0.35}>
          <Parallax
            distance={-20}
            className="pointer-events-none absolute -top-10 -right-2 hidden md:block lg:-right-12"
          >
            <div className="glass pointer-events-auto flex items-center gap-3 rounded-3xl p-4 shadow-soft">
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Bot className="size-4" aria-hidden />
              </span>
              <div className="text-xs">
                <p className="font-semibold">هوش مصنوعی فعال</p>
                <p className="text-muted">{fa("99.9")}٪ آپ‌تایم</p>
              </div>
            </div>
          </Parallax>
        </Reveal>
        {/* phone mock shown inline on mobile */}
        <div className="mt-6 flex justify-center md:hidden">
          <Reveal delay={0.15}>
            <TelegramMock />
          </Reveal>
        </div>
      </div>
      {/* spacer for the overlapping floating card */}
      <div className="hidden h-16 md:block" />
    </Section>
  );
}
