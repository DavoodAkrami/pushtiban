"use client";

import {
  Database,
  Send,
  Braces,
  Globe,
  FileText,
  Table2,
  StickyNote,
  HardDrive,
  Sheet,
  MessageSquareText,
} from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Stagger, StaggerItem } from "@/components/motion/reveal";

const INTEGRATIONS = [
  { icon: Database, label: "پایگاه داده" },
  { icon: Send, label: "تلگرام" },
  { icon: Braces, label: "API اختصاصی" },
  { icon: Globe, label: "وب‌سایت" },
  { icon: FileText, label: "فایل PDF" },
  { icon: Table2, label: "فایل CSV" },
  { icon: StickyNote, label: "نوشن" },
  { icon: HardDrive, label: "گوگل درایو" },
  { icon: Sheet, label: "گوگل شیت" },
  { icon: MessageSquareText, label: "سوالات متداول" },
];

export function Integrations() {
  return (
    <Section id="integrations">
      <SectionHeading
        eyebrow="یکپارچه‌سازی"
        title="به هر منبعی که دانش شماست متصل شوید"
        lead="داده‌ها هرجا که باشند، پشتیبان آن‌ها را می‌خواند؛ بدون جابه‌جایی، بدون فایل اضافه."
      />
      <Stagger className="mx-auto grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {INTEGRATIONS.map((item) => (
          <StaggerItem key={item.label}>
            <div className="glass group flex flex-col items-center gap-3 rounded-3xl p-6 transition-all duration-500 ease-luxe hover:-translate-y-1.5 hover:shadow-lift">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/10 text-accent transition-colors duration-300 group-hover:bg-accent/20">
                <item.icon className="size-5" aria-hidden />
              </span>
              <span className="text-xs font-medium text-muted transition-colors duration-300 group-hover:text-foreground">
                {item.label}
              </span>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
