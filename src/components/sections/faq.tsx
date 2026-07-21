"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Section, SectionHeading } from "@/components/ui/section";
import { Stagger, StaggerItem } from "@/components/motion/reveal";

const FAQS = [
  {
    q: "راه‌اندازی پشتیبان چقدر طول می‌کشد؟",
    a: "معمولا کمتر از ده دقیقه. کافی است منابع داده خود را متصل کنید؛ ساخت پایگاه دانش و استقرار ربات تلگرام به‌صورت کاملا خودکار انجام می‌شود و به دانش فنی نیاز ندارد.",
  },
  {
    q: "آیا هوش مصنوعی ممکن است پاسخ اشتباه بدهد؟",
    a: "پاسخ‌ها فقط بر اساس اطلاعاتی تولید می‌شوند که خودتان متصل کرده‌اید. اگر پاسخ پرسشی در داده‌های شما نباشد، ربات صادقانه اعلام می‌کند و در صورت تنظیم، گفتگو را به اپراتور انسانی ارجاع می‌دهد.",
  },
  {
    q: "اطلاعات کسب‌وکار من چقدر امن است؟",
    a: "داده‌های شما رمزنگاری‌شده ذخیره می‌شوند، هرگز برای آموزش مدل‌های عمومی استفاده نمی‌شوند و هر زمان بخواهید می‌توانید همه اطلاعات را به‌طور کامل حذف کنید.",
  },
  {
    q: "اگر داده‌هایم تغییر کند چه اتفاقی می‌افتد؟",
    a: "منابع متصل به‌صورت دوره‌ای همگام‌سازی می‌شوند. با تغییر قیمت، موجودی یا محتوای اسناد، پایگاه دانش به‌روز می‌شود و ربات همیشه بر اساس آخرین اطلاعات پاسخ می‌دهد.",
  },
  {
    q: "آیا می‌توانم لحن و رفتار ربات را شخصی‌سازی کنم؟",
    a: "بله. لحن پاسخ‌گویی، پیام خوش‌آمد، ساعات ارجاع به اپراتور و حتی نام ربات کاملا قابل تنظیم است تا با هویت برند شما هماهنگ باشد.",
  },
  {
    q: "آیا امکان لغو اشتراک وجود دارد؟",
    a: "هر زمان که بخواهید می‌توانید اشتراک را لغو کنید؛ بدون جریمه و بدون پرسش. طرح رایگان هم برای همیشه رایگان می‌ماند.",
  },
];

export function Faq() {
  return (
    <Section id="faq" className="bg-surface/60">
      <SectionHeading
        eyebrow="سوالات متداول"
        title="پاسخ پرسش‌های شما، همین‌جا"
        lead="اگر پاسخ‌تان را پیدا نکردید، تیم ما همیشه آماده گفتگوست."
      />
      <Stagger className="mx-auto max-w-2xl">
        <Accordion type="single" collapsible className="space-y-4">
          {FAQS.map((item, i) => (
            <StaggerItem key={i}>
              <AccordionItem value={`item-${i}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            </StaggerItem>
          ))}
        </Accordion>
      </Stagger>
    </Section>
  );
}
