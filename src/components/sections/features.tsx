"use client";

import {
  BrainCircuit,
  MessagesSquare,
  Send,
  Gauge,
  Languages,
  LineChart,
} from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { Stagger, StaggerItem } from "@/components/motion/reveal";

const FEATURES = [
  {
    icon: BrainCircuit,
    title: "پایگاه دانش هوشمند",
    body: "اسناد، محصولات و سوالات متداول شما به یک مغز واحد تبدیل می‌شوند؛ هوش مصنوعی همیشه از به‌روزترین اطلاعات پاسخ می‌دهد.",
  },
  {
    icon: Send,
    title: "ربات تلگرام آماده",
    body: "بدون حتی یک خط کد، ربات پشتیبانی اختصاصی شما در تلگرام ساخته و فعال می‌شود؛ همان‌جایی که مشتریان‌تان هستند.",
  },
  {
    icon: MessagesSquare,
    title: "پاسخ‌های دقیق و طبیعی",
    body: "پاسخ‌ها فقط بر اساس داده‌های کسب‌وکار شما تولید می‌شوند؛ لحن طبیعی، بدون حدس و بدون اطلاعات ساختگی.",
  },
  {
    icon: Gauge,
    title: "پاسخ در چند ثانیه",
    body: "مشتری هیچ‌وقت در صف نمی‌ماند. هر پرسش در کمتر از سه ثانیه پاسخ می‌گیرد؛ در هر ساعتی از شبانه‌روز.",
  },
  {
    icon: Languages,
    title: "درک کامل زبان فارسی",
    body: "از محاوره تا رسمی؛ مدل‌های ما برای درک عمیق زبان فارسی و اصطلاحات روزمره مشتریان ایرانی بهینه شده‌اند.",
  },
  {
    icon: LineChart,
    title: "تحلیل و گزارش زنده",
    body: "پرتکرارترین سوالات، رضایت مشتریان و روند مکالمات را در داشبوردی شفاف ببینید و هوشمندانه تصمیم بگیرید.",
  },
];

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="امکانات"
        title="هر آنچه برای پشتیبانی بی‌نقص لازم است"
        lead="پشتیبان تمام مسیر را پوشش می‌دهد؛ از اتصال دانش کسب‌وکار تا پاسخ‌گویی لحظه‌ای به مشتریان."
      />
      <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <StaggerItem key={f.title}>
            <GlassCard className="h-full p-7">
              <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent transition-transform duration-500 ease-luxe group-hover:scale-110">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mb-2.5 text-lg font-bold">{f.title}</h3>
              <p className="text-sm leading-7 text-muted">{f.body}</p>
            </GlassCard>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
