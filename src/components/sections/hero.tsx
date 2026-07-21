"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import {
  ShieldCheck,
  Sparkles,
  Zap,
  ArrowLeft,
  PlayCircle,
  Send,
  CheckCheck,
  Database,
  BookOpenText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WordReveal, Reveal, luxe } from "@/components/motion/reveal";
import { AmbientBackground } from "@/components/motion/parallax";
import { fa } from "@/lib/utils";

const STATS = [
  { value: fa("98") + "٪", label: "دقت پاسخ‌ها" },
  { value: "کمتر از " + fa("3") + " ثانیه", label: "میانگین زمان پاسخ" },
  { value: fa("24") + "/" + fa("7"), label: "پشتیبانی بی‌وقفه" },
  { value: fa("+1200"), label: "کسب‌وکار فعال" },
];

/** Floating Telegram-style chat preview — the hero's signature element. */
function ChatPreview() {
  return (
    <div className="glass-strong w-full max-w-sm rounded-3xl p-5 shadow-lift">
      <div className="mb-4 flex items-center gap-3 border-b border-line pb-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Send className="size-4 -translate-x-px translate-y-px" />
        </span>
        <div>
          <p className="text-sm font-semibold">ربات پشتیبانی فروشگاه نیلا</p>
          <p className="text-xs text-accent">آنلاین — پاسخ فوری</p>
        </div>
      </div>
      <div className="space-y-3 text-sm leading-7">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.7, ease: luxe }}
          className="me-8 rounded-2xl rounded-tr-md bg-card px-4 py-2.5"
        >
          سلام! سفارش من کی ارسال می‌شه؟
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.9, duration: 0.7, ease: luxe }}
          className="ms-8 rounded-2xl rounded-tl-md bg-accent/15 px-4 py-2.5"
        >
          سلام، وقت‌تون بخیر! سفارش شما امروز بسته‌بندی شده و فردا تحویل پست
          می‌شود. کد رهگیری تا ساعت ۱۸ برایتان ارسال خواهد شد.
          <span className="mt-1 flex items-center justify-end gap-1 text-xs text-accent">
            <CheckCheck className="size-3.5" />
            پاسخ هوش مصنوعی
          </span>
        </motion.div>
      </div>
    </div>
  );
}

export function Hero() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 16 });
  const sy = useSpring(my, { stiffness: 40, damping: 16 });
  const layer1x = useTransform(sx, (v) => v * 16);
  const layer1y = useTransform(sy, (v) => v * 16);
  const layer2x = useTransform(sx, (v) => v * -26);
  const layer2y = useTransform(sy, (v) => v * -26);

  function onMouseMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className="relative overflow-hidden pb-24 pt-40 md:pb-32 md:pt-48"
    >
      <AmbientBackground />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-start">
          <Reveal blur={false} y={16}>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent">
              <Sparkles className="size-3.5" />
              نسل جدید پشتیبانی مشتریان با هوش مصنوعی
            </span>
          </Reveal>

          <h1 className="text-balance text-4xl font-black leading-[1.3] sm:text-5xl sm:leading-[1.3] lg:text-[3.4rem] lg:leading-[1.28]">
            <WordReveal
              text="پشتیبانی مشتریان را به هوش مصنوعی بسپارید"
              accentWords={["هوش", "مصنوعی"]}
              delay={0.2}
            />
          </h1>

          <Reveal delay={0.7} y={20}>
            <p className="mx-auto mt-6 max-w-xl text-balance text-lg leading-9 text-muted lg:mx-0">
              دانش کسب‌وکارتان را متصل کنید؛ پشتیبان در چند دقیقه یک دستیار
              هوشمند و ربات تلگرام می‌سازد که به هر پرسش مشتری، فوری و دقیق پاسخ
              می‌دهد — بر پایه اطلاعات خودِ شما.
            </p>
          </Reveal>

          <Reveal delay={0.9} y={20}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => router.push("/auth")}
              >
                شروع رایگان
                <ArrowLeft className="size-4" />
              </Button>
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                <PlayCircle className="size-4" />
                مشاهده دمو
              </Button>
            </div>
          </Reveal>

          <Reveal delay={1.1} y={16} blur={false}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted lg:justify-start">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-accent" />
                امنیت کامل داده‌ها
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="size-4 text-accent" />
                راه‌اندازی در کمتر از ۱۰ دقیقه
              </span>
            </div>
          </Reveal>
        </div>

        {/* Floating illustration cluster */}
        <div className="relative mx-auto hidden min-h-[26rem] w-full max-w-md sm:block">
          <motion.div
            style={reduce ? undefined : { x: layer1x, y: layer1y }}
            initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 0.5, ease: luxe }}
            className="animate-drift"
          >
            <ChatPreview />
          </motion.div>

          <motion.div
            style={reduce ? undefined : { x: layer2x, y: layer2y }}
            initial={{ opacity: 0, y: 30, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 0.8, ease: luxe }}
            className="glass absolute -left-6 -top-10 flex items-center gap-3 rounded-3xl p-4 shadow-soft animate-drift lg:-left-14"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Database className="size-4" />
            </span>
            <div className="text-xs">
              <p className="font-semibold">پایگاه داده متصل شد</p>
              <p className="text-muted">{fa("2400")} محصول ایندکس شد</p>
            </div>
          </motion.div>

          <motion.div
            style={
              reduce
                ? { animationDelay: "-3s" }
                : { x: layer2x, y: layer2y, animationDelay: "-3s" }
            }
            initial={{ opacity: 0, y: 30, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 1, ease: luxe }}
            className="glass absolute -bottom-8 -right-4 flex items-center gap-3 rounded-3xl p-4 shadow-soft animate-drift lg:-right-12"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <BookOpenText className="size-4" />
            </span>
            <div className="text-xs">
              <p className="font-semibold">یادگیری کامل شد</p>
              <p className="text-muted">دقت پاسخ: {fa("98")}٪</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Statistics */}
      <div className="relative mx-auto mt-20 w-full max-w-6xl px-5 sm:px-8 md:mt-28">
        <Reveal>
          <dl className="glass grid grid-cols-2 gap-y-8 rounded-4xl px-6 py-8 md:grid-cols-4 md:py-10">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <dd className="text-2xl font-extrabold text-foreground md:text-3xl">
                  {s.value}
                </dd>
                <dt className="mt-1.5 text-xs text-muted md:text-sm">
                  {s.label}
                </dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </div>
  );
}
