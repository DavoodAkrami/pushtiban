"use client";

import { Check } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { cn, fa } from "@/lib/utils";

const PLANS = [
  {
    name: "شروع",
    price: "رایگان",
    period: "برای همیشه",
    description: "برای آشنایی با پشتیبان و کسب‌وکارهای تازه‌کار",
    features: [
      fa("100") + " مکالمه در ماه",
      "یک ربات تلگرام",
      "اتصال " + fa("3") + " منبع داده",
      "پایگاه دانش پایه",
    ],
    cta: "شروع رایگان",
    popular: false,
  },
  {
    name: "حرفه‌ای",
    price: fa("1.490.000") + " تومان",
    period: "ماهانه",
    description: "برای کسب‌وکارهای در حال رشد با مشتریان فعال",
    features: [
      fa("5000") + " مکالمه در ماه",
      "ربات‌های نامحدود",
      "اتصال منابع نامحدود",
      "داشبورد تحلیلی کامل",
      "ارجاع هوشمند به اپراتور",
      "پشتیبانی اولویت‌دار",
    ],
    cta: "شروع دوره آزمایشی",
    popular: true,
  },
  {
    name: "سازمانی",
    price: "تماس بگیرید",
    period: "قرارداد سالانه",
    description: "برای سازمان‌ها با نیازهای امنیتی و حجم بالا",
    features: [
      "مکالمات نامحدود",
      "استقرار اختصاصی",
      "توافق‌نامه سطح خدمات (SLA)",
      "مدیر موفقیت مشتری",
    ],
    cta: "گفتگو با تیم فروش",
    popular: false,
  },
];

export function Pricing() {
  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow="تعرفه‌ها"
        title="ساده شروع کنید، با خیال راحت رشد کنید"
        lead="بدون هزینه پنهان، بدون تعهد بلندمدت. هر زمان خواستید ارتقا دهید یا لغو کنید."
      />
      <Stagger className="grid items-stretch gap-5 md:grid-cols-3">
        {PLANS.map((plan) => (
          <StaggerItem key={plan.name} className="h-full">
            <GlassCard
              className={cn(
                "relative flex h-full flex-col p-7",
                plan.popular && "border-accent/30 shadow-glow md:-translate-y-3"
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3.5 right-7 rounded-full bg-accent px-4 py-1 text-xs font-bold text-white shadow-glow">
                  محبوب‌ترین
                </span>
              )}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="mt-1 text-xs text-muted">{plan.description}</p>
              <p className="mt-6">
                <span className="text-3xl font-black">{plan.price}</span>
                <span className="ms-2 text-xs text-muted">{plan.period}</span>
              </p>
              <ul className="mt-7 flex-1 space-y-3.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.popular ? "primary" : "secondary"}
                className="mt-8 w-full"
              >
                {plan.cta}
              </Button>
            </GlassCard>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
