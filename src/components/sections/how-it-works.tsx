"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import {
  DatabaseZap,
  BrainCog,
  Send,
  MessageCircleQuestion,
  Sparkles,
} from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { fa } from "@/lib/utils";

const STEPS = [
  {
    icon: DatabaseZap,
    title: "اتصال منابع داده",
    body: "پایگاه داده محصولات، اسناد، فایل‌های PDF، وب‌سایت و سوالات متداول خود را با چند کلیک متصل کنید.",
  },
  {
    icon: BrainCog,
    title: "یادگیری خودکار",
    body: "هوش مصنوعی تمام اطلاعات را می‌خواند، ساختار می‌دهد و پایگاه دانش اختصاصی کسب‌وکار شما را می‌سازد.",
  },
  {
    icon: Send,
    title: "راه‌اندازی ربات تلگرام",
    body: "ربات پشتیبانی شما به‌صورت خودکار ساخته و روی تلگرام مستقر می‌شود؛ آماده گفتگو با اولین مشتری.",
  },
  {
    icon: MessageCircleQuestion,
    title: "پرسش مشتری",
    body: "مشتریان سوال‌شان را به زبان خودشان می‌پرسند؛ از وضعیت سفارش تا جزئیات فنی محصول.",
  },
  {
    icon: Sparkles,
    title: "پاسخ هوشمند و فوری",
    body: "هوش مصنوعی در چند ثانیه پاسخ دقیق و مستند می‌دهد و موارد پیچیده را به تیم شما ارجاع می‌کند.",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 70%"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 60, damping: 20 });

  return (
    <Section id="how-it-works" className="bg-surface/60">
      <SectionHeading
        eyebrow="نحوه کار"
        title="از داده تا پاسخ، در پنج قدم ساده"
        lead="راه‌اندازی پشتیبان به دانش فنی نیاز ندارد؛ کل مسیر کمتر از ده دقیقه طول می‌کشد."
      />

      <div ref={ref} className="relative mx-auto max-w-2xl">
        {/* progress rail (right side in RTL) */}
        <div
          aria-hidden
          className="absolute right-[1.4rem] top-2 bottom-2 w-px bg-line"
        />
        <motion.div
          aria-hidden
          style={{ scaleY: progress }}
          className="absolute right-[1.4rem] top-2 bottom-2 w-px origin-top bg-accent motion-reduce:scale-y-100"
        />

        <ol className="space-y-10">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} as="li" delay={i * 0.05}>
              <div className="relative flex gap-6 ps-0">
                <span className="glass relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl text-accent shadow-soft">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <div className="pt-1">
                  <p className="mb-1 text-xs font-semibold text-accent">
                    قدم {fa(i + 1)}
                  </p>
                  <h3 className="mb-2 text-lg font-bold">{step.title}</h3>
                  <p className="text-sm leading-7 text-muted">{step.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
