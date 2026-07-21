"use client";

import { X, Check, ArrowDown } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";

const BEFORE = [
  "مشتریان ساعت‌ها در انتظار پاسخ می‌مانند",
  "تیم پشتیبانی غرق در سوالات تکراری است",
  "بعد از ساعت کاری، هیچ‌کس پاسخگو نیست",
  "کیفیت پاسخ‌ها به حالِ روز اپراتور بستگی دارد",
  "هزینه استخدام و آموزش مدام بالا می‌رود",
];

const AFTER = [
  "پاسخ دقیق در کمتر از سه ثانیه، شبانه‌روزی",
  "سوالات تکراری به‌طور کامل خودکار می‌شوند",
  "ربات تلگرام حتی نیمه‌شب هم پاسخگوست",
  "پاسخ‌ها همیشه یکدست، مستند و قابل اتکا هستند",
  "تیم شما فقط روی موارد پیچیده تمرکز می‌کند",
];

export function Benefits() {
  return (
    <Section id="benefits" className="bg-surface/60">
      <SectionHeading
        eyebrow="چرا پشتیبان؟"
        title="تفاوت را از روز اول احساس کنید"
        lead="پشتیبانی سنتی پرهزینه و کند است. ببینید بعد از اتصال پشتیبان چه چیزی تغییر می‌کند."
      />
      <div className="relative mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <Reveal>
          <GlassCard interactive={false} className="h-full p-8 opacity-80">
            <p className="mb-6 text-sm font-bold text-muted">
              قبل از پشتیبان
            </p>
            <ul className="space-y-4">
              {BEFORE.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-7">
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-line">
                    <X className="size-3 text-muted" aria-hidden />
                  </span>
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </Reveal>

        <Reveal delay={0.15}>
          <GlassCard className="h-full border-accent/25 p-8 shadow-glow">
            <p className="mb-6 text-sm font-bold text-accent">بعد از پشتیبان</p>
            <Stagger>
              <ul className="space-y-4">
                {AFTER.map((item) => (
                  <StaggerItem key={item}>
                    <li className="flex items-start gap-3 text-sm leading-7">
                      <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/20">
                        <Check className="size-3 text-accent" aria-hidden />
                      </span>
                      {item}
                    </li>
                  </StaggerItem>
                ))}
              </ul>
            </Stagger>
          </GlassCard>
        </Reveal>

        {/* connector for mobile */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex"
        >
          <span className="glass flex size-11 items-center justify-center rounded-full shadow-soft">
            <ArrowDown className="size-4 -rotate-90 text-accent rtl:rotate-90" />
          </span>
        </div>
      </div>
    </Section>
  );
}
