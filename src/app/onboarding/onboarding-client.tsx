"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  PackageCheck,
  RotateCcw,
  Send,
  Shirt,
  ShoppingBag,
  Sparkles,
  User,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { luxe } from "@/components/motion/reveal";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";
import { cn, fa } from "@/lib/utils";

export type BotIdentity = {
  id: string;
  name: string;
  username: string;
};

type StepId =
  | "telegram"
  | "botfather"
  | "create"
  | "token"
  | "demo"
  | "profile";

type Flow = "undecided" | "connect" | "skip";

type StepDefinition = {
  id: StepId;
  shortTitle: string;
};

const CONNECT_STEPS: StepDefinition[] = [
  { id: "telegram", shortTitle: "اتصال تلگرام" },
  { id: "botfather", shortTitle: "باز کردن BotFather" },
  { id: "create", shortTitle: "ساخت ربات" },
  { id: "token", shortTitle: "تأیید اتصال" },
  { id: "demo", shortTitle: "نمایش یک سفارش" },
  { id: "profile", shortTitle: "معرفی کسب‌وکار" },
];

const SKIP_STEPS: StepDefinition[] = [
  { id: "telegram", shortTitle: "اتصال تلگرام" },
  { id: "profile", shortTitle: "معرفی کسب‌وکار" },
];

const PRODUCTS = [
  { name: "تی‌شرت کلاسیک مشکی", price: 790_000 },
  { name: "تی‌شرت اورسایز ذغالی", price: 940_000 },
  { name: "تی‌شرت نخ‌پنبه مشکی", price: 860_000 },
];

const PRICE_FORMATTER = new Intl.NumberFormat("fa-IR");

const CATEGORY_OPTIONS = BUSINESS_CATEGORIES.map((category) => ({
  value: category.slug,
  label: category.label,
  description: category.description,
}));

const Slide = ({
  children,
  direction,
  className,
}: {
  children: React.ReactNode;
  direction: 1 | -1;
  className?: string;
}) => {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 32 }}
      transition={{ duration: reduce ? 0 : 0.35, ease: luxe }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const CommandRow = ({ command }: { command: string }) => {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      dir="ltr"
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-background/50 px-4 py-3"
    >
      <code className="text-sm font-semibold text-foreground">{command}</code>
      <button
        type="button"
        onClick={() => void copyCommand()}
        className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        aria-label={copied ? "کپی شد" : `کپی ${command}`}
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
};

const DemoBubble = ({
  side,
  label,
  children,
}: {
  side: "customer" | "bot";
  label: string;
  children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, ease: luxe }}
    className={cn(
      "max-w-[88%] rounded-2xl border border-line px-4 py-3 text-xs leading-6 sm:text-sm",
      side === "customer"
        ? "me-auto rounded-tr-md bg-card"
        : "ms-auto rounded-tl-md bg-accent/10"
    )}
  >
    <span className="mb-1 block text-[10px] font-medium text-muted">
      {label}
    </span>
    {children}
  </motion.div>
);

const ChatDemo = ({ botName }: { botName: string }) => {
  const reduce = useReducedMotion();
  const [stage, setStage] = React.useState(reduce ? 7 : 0);
  const [replay, setReplay] = React.useState(0);

  React.useEffect(() => {
    if (reduce) {
      setStage(7);
      return;
    }

    setStage(0);
    const delays = [550, 1_650, 3_000, 4_350, 5_650, 7_050, 8_350];
    const timers = delays.map((delay, index) =>
      window.setTimeout(() => setStage(index + 1), delay)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduce, replay]);

  return (
    <GlassCard interactive={false} className="bg-background/50">
      <div
        role="img"
        aria-label="نمایش گفتگوی مشتری با ربات: مشتری تی‌شرت مشکی سایز XL می‌خواهد، ربات محصولات موجود را پیشنهاد می‌دهد، فرم سفارش تکمیل می‌شود و سفارش ثبت می‌شود."
        className="overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Bot className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{botName}</p>
              <p className="text-[11px] text-success">پاسخ‌گوی خودکار</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplay((value) => value + 1)}
            className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label="پخش دوباره نمایش"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
        </div>

        <div
          aria-hidden
          className="h-[25rem] space-y-3 overflow-y-auto px-3 py-4 sm:h-[27rem] sm:px-5"
        >
          <AnimatePresence initial={false}>
            {stage >= 1 && (
              <DemoBubble key="question" side="customer" label="مشتری">
                سلام، تی‌شرت مشکی سایز XL دارید؟
              </DemoBubble>
            )}

            {stage >= 2 && (
              <DemoBubble key="answer" side="bot" label={botName}>
                بله، این مدل‌ها الان موجودند:
              </DemoBubble>
            )}

            {stage >= 3 && (
              <motion.div
                key="products"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: luxe }}
                className="ms-auto flex max-w-full snap-x gap-2 overflow-x-auto pb-2"
              >
                {PRODUCTS.map((product, index) => (
                  <motion.div
                    key={product.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.45,
                      delay: reduce ? 0 : index * 0.1,
                      ease: luxe,
                    }}
                    className="min-w-40 snap-start rounded-2xl border border-line bg-card p-3 sm:min-w-44"
                  >
                    <span className="mb-3 flex h-20 items-center justify-center rounded-xl bg-surface text-muted">
                      <Shirt className="size-9" aria-hidden />
                    </span>
                    <p className="min-h-10 text-xs font-bold leading-5">
                      {product.name}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted">
                        {PRICE_FORMATTER.format(product.price)} تومان
                      </span>
                      <Badge variant="success" className="px-2 py-0.5 text-[10px]">
                        XL
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {stage >= 4 && (
              <DemoBubble key="choice" side="customer" label="مشتری">
                تی‌شرت کلاسیک مشکی رو می‌خوام.
              </DemoBubble>
            )}

            {stage >= 5 && (
              <DemoBubble key="form-intro" side="bot" label={botName}>
                انتخاب خوبی است. این فرم کوتاه را تکمیل کنید تا سفارش ثبت شود.
              </DemoBubble>
            )}

            {stage >= 5 && (
              <motion.div
                key="order-form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: luxe }}
                className="ms-auto max-w-[92%] rounded-2xl border border-line bg-card p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <ShoppingBag className="size-4 text-accent" aria-hidden />
                  <p className="text-xs font-bold">فرم ثبت سفارش</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["نام تحویل‌گیرنده", "مریم احمدی"],
                    ["شماره تماس", fa("09121234567")],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-line bg-surface/70 px-3 py-2"
                    >
                      <span className="block text-[10px] text-muted">{label}</span>
                      <motion.span
                        initial={false}
                        animate={{ opacity: stage >= 6 ? 1 : 0.35 }}
                        className="mt-1 block min-h-5 text-xs font-medium"
                      >
                        {stage >= 6 ? value : "در حال تکمیل…"}
                      </motion.span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {stage >= 7 && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: luxe }}
                className="ms-auto flex max-w-[92%] items-center gap-3 rounded-2xl border border-success/25 bg-success/10 p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <PackageCheck className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-bold text-success">سفارش ثبت شد</p>
                  <p className="mt-1 text-[11px] text-muted">
                    کد سفارش {fa("PS-1048")} برای مشتری فرستاده شد.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </GlassCard>
  );
};

const guideItemClass =
  "flex gap-3 rounded-2xl border border-line bg-background/35 p-4";

export const OnboardingClient = ({
  initialBot,
  initialProfile,
}: {
  initialBot: BotIdentity | null;
  initialProfile: {
    fullName: string;
    businessName: string;
    businessCategory: string;
  };
}) => {
  const router = useRouter();
  const reduce = useReducedMotion();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const firstRender = React.useRef(true);

  const [flow, setFlow] = React.useState<Flow>(
    initialBot ? "connect" : "undecided"
  );
  const [step, setStep] = React.useState<StepId>("telegram");
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const [token, setToken] = React.useState("");
  const [bot, setBot] = React.useState<BotIdentity | null>(initialBot);
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [fullName, setFullName] = React.useState(initialProfile.fullName);
  const [businessName, setBusinessName] = React.useState(
    initialProfile.businessName
  );
  const [businessCategory, setBusinessCategory] = React.useState(
    initialProfile.businessCategory
  );
  const [profileErrors, setProfileErrors] = React.useState<
    Record<string, string>
  >({});
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const steps = flow === "skip" ? SKIP_STEPS : CONNECT_STEPS;
  const currentIndex = Math.max(
    0,
    steps.findIndex((item) => item.id === step)
  );

  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const goTo = (nextStep: StepId, nextDirection: 1 | -1 = 1) => {
    setDirection(nextDirection);
    setTokenError(null);
    setProfileError(null);
    setStep(nextStep);
  };

  const startTelegramGuide = () => {
    setFlow("connect");
    goTo(bot ? "demo" : "botfather");
  };

  const skipTelegram = () => {
    setFlow("skip");
    goTo("profile");
  };

  const goBack = () => {
    const previous: Partial<Record<StepId, StepId>> = {
      botfather: "telegram",
      create: "botfather",
      token: "create",
      demo: bot && initialBot ? "telegram" : "token",
      profile: flow === "skip" ? "telegram" : "demo",
    };
    const target = previous[step];
    if (target) goTo(target, -1);
  };

  const connectBot = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanToken = token.trim();
    if (!/^\d{6,20}:[A-Za-z0-9_-]{20,100}$/.test(cleanToken)) {
      setTokenError("توکن کامل BotFather را وارد کنید.");
      return;
    }

    setConnecting(true);
    setTokenError(null);

    try {
      const response = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleanToken }),
      });
      const data = (await response.json()) as {
        bot?: BotIdentity;
        error?: string;
      };

      if (!response.ok || !data.bot) {
        setTokenError(data.error ?? "اتصال ربات انجام نشد؛ دوباره تلاش کنید.");
        if (response.status === 401) router.push("/auth");
        return;
      }

      setBot(data.bot);
      setToken("");
    } catch {
      setTokenError("اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.");
    } finally {
      setConnecting(false);
    }
  };

  const completeOnboarding = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    const cleanFullName = fullName.trim();
    const cleanBusinessName = businessName.trim();

    if (cleanFullName.length < 3) {
      errors.fullName = "نام و نام خانوادگی را کامل بنویسید.";
    }
    if (cleanBusinessName.length < 2) {
      errors.businessName = "نام کسب‌وکارتان را وارد کنید.";
    }
    if (!businessCategory) {
      errors.businessCategory = "دسته کسب‌وکارتان را انتخاب کنید.";
    }
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setProfileError(null);

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: cleanFullName,
          businessName: cleanBusinessName,
          businessCategory,
          telegramSkipped: flow === "skip" && !bot,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setProfileError(data.error ?? "ذخیره اطلاعات انجام نشد؛ دوباره تلاش کنید.");
        if (response.status === 401) router.push("/auth");
        return;
      }

      router.push("/dashboard/overview");
      router.refresh();
    } catch {
      setProfileError("اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-x-hidden px-4 py-6 sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(44rem_20rem_at_50%_-5rem,rgb(var(--accent)/0.13),transparent_72%)]"
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: luxe }}
        className="relative mx-auto w-full max-w-5xl"
      >
        <Link
          href="/"
          className="mb-6 flex w-fit items-center gap-2.5 rounded-full font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-glow">
            <Bot className="size-5" aria-hidden />
          </span>
          پشتیبان
        </Link>

        <div className="grid overflow-hidden rounded-3xl border border-line bg-surface/60 shadow-soft lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="hidden border-e border-line bg-background/25 p-7 lg:flex lg:min-h-[42rem] lg:flex-col">
            <div>
              <p className="text-xs font-medium text-accent">شروع کار با پشتیبان</p>
              <p className="mt-2 text-sm leading-7 text-muted">
                چند قدم کوتاه تا اولین پاسخ هوشمند شما.
              </p>
            </div>

            <ol className="mt-9 space-y-1" aria-label="مراحل راه‌اندازی">
              {steps.map((item, index) => {
                const active = item.id === step;
                const complete = index < currentIndex;
                return (
                  <li
                    key={item.id}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-3 text-xs transition-colors",
                      active ? "bg-accent/10 text-accent" : "text-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        active && "border-accent bg-accent text-accent-foreground",
                        complete && "border-success/30 bg-success/10 text-success",
                        !active && !complete && "border-line bg-surface"
                      )}
                    >
                      {complete ? <Check className="size-3" /> : fa(index + 1)}
                    </span>
                    <span className={cn(active && "font-bold")}>{item.shortTitle}</span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-auto rounded-2xl border border-line bg-surface/50 p-4">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Sparkles className="size-4 text-accent" aria-hidden />
                راه‌اندازی بدون تنظیم فنی
              </div>
              <p className="mt-2 text-[11px] leading-6 text-muted">
                توکن ربات فقط روی سرور بررسی و به‌صورت رمزگذاری‌شده نگه‌داری می‌شود.
              </p>
            </div>
          </aside>

          <section className="min-w-0 p-5 sm:p-8 lg:p-11">
            <div className="mb-6 lg:hidden">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>{steps[currentIndex]?.shortTitle}</span>
                <span>
                  مرحله {fa(currentIndex + 1)} از {fa(steps.length)}
                </span>
              </div>
              <div
                className="h-1 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label="پیشرفت راه‌اندازی"
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuenow={currentIndex + 1}
              >
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={false}
                  animate={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
                  transition={{ duration: reduce ? 0 : 0.4, ease: luxe }}
                />
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {step === "telegram" && (
                <Slide key="telegram" direction={direction} className="mx-auto flex min-h-[34rem] max-w-xl flex-col justify-center py-4 text-center">
                  <Icon
                    icon={Send}
                    tile
                    size="xl"
                    tone={bot ? "success" : "accent"}
                    label="تلگرام"
                    className="mx-auto"
                  />
                  <p className="mt-6 text-xs font-medium text-accent">
                    کانال اول پشتیبانی
                  </p>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="mt-3 text-balance text-2xl font-black leading-10 outline-none sm:text-3xl"
                  >
                    {bot
                      ? `ربات «${bot.name}» آماده ادامه است`
                      : "پشتیبان را به ربات تلگرام‌تان وصل کنید"}
                  </h1>
                  <p className="mx-auto mt-4 max-w-lg text-sm leading-8 text-muted">
                    {bot
                      ? `اتصال @${bot.username} قبلاً تأیید شده است. حالا ببینید چطور یک سؤال ساده را به سفارش تبدیل می‌کند.`
                      : "مشتری‌ها همان‌جا که پیام می‌دهند پاسخ می‌گیرند؛ راه‌اندازی را قدم‌به‌قدم و بدون تنظیم فنی انجام می‌دهیم."}
                  </p>

                  {bot && (
                    <Badge variant="success" dot className="mx-auto mt-5" dir="ltr">
                      @{bot.username}
                    </Badge>
                  )}

                  <div className="mx-auto mt-8 w-full max-w-sm space-y-3">
                    <Button
                      size="lg"
                      className="w-full"
                      startIcon={bot ? <Sparkles className="size-4" /> : <Send className="size-4" />}
                      onClick={startTelegramGuide}
                    >
                      {bot
                        ? "دیدن نحوه پاسخ‌گویی"
                        : "اتصال پشتیبان به ربات تلگرام"}
                    </Button>
                    {bot ? (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setFlow("connect");
                          goTo("botfather");
                        }}
                      >
                        اتصال یک ربات دیگر
                      </Button>
                    ) : (
                      <Button variant="link" size="sm" onClick={skipTelegram}>
                        فعلاً رد می‌کنم
                      </Button>
                    )}
                  </div>
                </Slide>
              )}

              {step === "botfather" && (
                <Slide key="botfather" direction={direction} className="mx-auto max-w-xl py-2">
                  <Icon icon={Bot} tile size="lg" tone="accent" />
                  <p className="mt-5 text-xs font-medium text-accent">قدم اول</p>
                  <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black leading-10 outline-none">
                    BotFather را باز کنید
                  </h1>
                  <p className="mt-3 text-sm leading-8 text-muted">
                    BotFather ابزار رسمی تلگرام برای ساخت و مدیریت ربات‌هاست. روی دکمه زیر بزنید، سپس در تلگرام «Start» را انتخاب کنید.
                  </p>

                  <div className="mt-6 space-y-3">
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "lg", className: "w-full" })}
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      باز کردن BotFather
                    </a>
                    <CommandRow command="/start" />
                  </div>

                  <Alert
                    variant="info"
                    title="نشان تأیید را بررسی کنید"
                    description="ربات رسمی BotFather نام کاربری @BotFather و نشان تأیید تلگرام دارد."
                    className="mt-5"
                  />

                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
                    <Button variant="ghost" onClick={goBack} startIcon={<ArrowRight className="size-4" />}>
                      قبلی
                    </Button>
                    <Button className="flex-1" onClick={() => goTo("create")} endIcon={<ArrowLeft className="size-4" />}>
                      BotFather باز شد، ادامه
                    </Button>
                  </div>
                </Slide>
              )}

              {step === "create" && (
                <Slide key="create" direction={direction} className="mx-auto max-w-xl py-2">
                  <Icon icon={AtSign} tile size="lg" tone="accent" />
                  <p className="mt-5 text-xs font-medium text-accent">قدم دوم</p>
                  <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black leading-10 outline-none">
                    نام ربات را انتخاب کنید
                  </h1>
                  <p className="mt-3 text-sm leading-8 text-muted">
                    دستور ساخت ربات را بفرستید؛ BotFather بعد از آن دو نام از شما می‌خواهد.
                  </p>

                  <div className="mt-6 space-y-3">
                    <CommandRow command="/newbot" />
                    {[
                      {
                        title: "نام نمایشی",
                        copy: "نامی که مشتری می‌بیند؛ مثلاً «پشتیبانی فروشگاه نیلا».",
                      },
                      {
                        title: "نام کاربری",
                        copy: "یک نام یکتا با حروف انگلیسی که به bot ختم شود؛ مثلاً NilaSupportBot.",
                      },
                    ].map((item, index) => (
                      <div key={item.title} className={guideItemClass}>
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
                          {fa(index + 1)}
                        </span>
                        <div>
                          <p className="text-sm font-bold">{item.title}</p>
                          <p className="mt-1 text-xs leading-6 text-muted">{item.copy}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
                    <Button variant="ghost" onClick={goBack} startIcon={<ArrowRight className="size-4" />}>
                      قبلی
                    </Button>
                    <Button className="flex-1" onClick={() => goTo("token")} endIcon={<ArrowLeft className="size-4" />}>
                      نام ربات ساخته شد
                    </Button>
                  </div>
                </Slide>
              )}

              {step === "token" && (
                <Slide key="token" direction={direction} className="mx-auto max-w-xl py-2">
                  <Icon icon={KeyRound} tile size="lg" tone={bot ? "success" : "accent"} />
                  <p className="mt-5 text-xs font-medium text-accent">قدم سوم</p>
                  <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black leading-10 outline-none">
                    {bot ? `ربات «${bot.name}» متصل شد` : "توکن ربات را وارد کنید"}
                  </h1>
                  <p className="mt-3 text-sm leading-8 text-muted">
                    {bot
                      ? "نام و شناسه ربات مستقیماً از تلگرام خوانده شد. توکن در مرورگر نگه‌داری نمی‌شود."
                      : "BotFather در آخرین پیام یک توکن بلند می‌فرستد. آن را کامل کپی کنید و فقط در کادر امن زیر قرار دهید."}
                  </p>

                  {bot ? (
                    <div className="mt-7 space-y-5">
                      <div className="flex items-center gap-4 rounded-3xl border border-success/25 bg-success/10 p-5">
                        <Icon icon={CheckCircle2} tile size="md" tone="success" />
                        <div className="min-w-0">
                          <p className="font-bold">{bot.name}</p>
                          <p dir="ltr" className="mt-1 truncate text-start text-sm text-muted">
                            @{bot.username}
                          </p>
                        </div>
                        <Badge variant="success" dot className="ms-auto shrink-0">
                          تأیید شد
                        </Badge>
                      </div>
                      <Alert
                        variant="info"
                        title="اتصال حساب تأیید شد"
                        description="نمایش بعدی یک نمونه شبیه‌سازی‌شده از تجربه مشتری است؛ پاسخ‌گویی زنده پس از افزودن دانش کسب‌وکار فعال می‌شود."
                      />
                    </div>
                  ) : (
                    <form onSubmit={(event) => void connectBot(event)} noValidate className="mt-7 space-y-5">
                      <Input
                        label="توکن ربات"
                        type="password"
                        dir="ltr"
                        className="text-start"
                        placeholder="123456789:AA..."
                        autoComplete="off"
                        spellCheck={false}
                        startIcon={<KeyRound />}
                        value={token}
                        onChange={(event) => {
                          setToken(event.target.value);
                          setTokenError(null);
                        }}
                        error={tokenError ?? undefined}
                        hint="توکن فقط برای تأیید ربات به سرور امن پشتیبان فرستاده می‌شود."
                        required
                      />
                      <Button type="submit" loading={connecting} className="w-full" startIcon={<Send className="size-4" />}>
                        بررسی و اتصال ربات
                      </Button>
                    </form>
                  )}

                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
                    <Button variant="ghost" onClick={goBack} startIcon={<ArrowRight className="size-4" />}>
                      قبلی
                    </Button>
                    {bot && (
                      <Button className="flex-1" onClick={() => goTo("demo")} endIcon={<ArrowLeft className="size-4" />}>
                        دیدن پشتیبان در عمل
                      </Button>
                    )}
                  </div>
                </Slide>
              )}

              {step === "demo" && bot && (
                <Slide key="demo" direction={direction} className="py-1">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-accent">یک گفتگوی نمونه</p>
                      <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-balance text-2xl font-black leading-10 outline-none">
                        از سؤال مشتری تا ثبت سفارش
                      </h1>
                      <p className="mt-2 text-sm leading-7 text-muted">
                        ببینید {bot.name} چطور نیاز مشتری را می‌فهمد و مسیر خرید را کامل می‌کند.
                      </p>
                    </div>
                    <Icon icon={Shirt} tile size="md" tone="accent" className="hidden shrink-0 sm:inline-flex" />
                  </div>

                  <ChatDemo botName={bot.name} />

                  <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                    <Button variant="ghost" onClick={goBack} startIcon={<ArrowRight className="size-4" />}>
                      قبلی
                    </Button>
                    <div className="flex-1 text-center sm:text-start">
                      <Button className="w-full sm:w-auto" onClick={() => goTo("profile")} endIcon={<ArrowLeft className="size-4" />}>
                        تکمیل راه‌اندازی
                      </Button>
                      <p className="mt-2 text-[11px] text-muted">
                        لازم نیست منتظر پایان نمایش بمانید.
                      </p>
                    </div>
                  </div>
                </Slide>
              )}

              {step === "profile" && (
                <Slide key="profile" direction={direction} className="mx-auto flex min-h-[34rem] max-w-xl flex-col justify-center py-3">
                  <Icon icon={User} tile size="lg" tone="accent" />
                  <p className="mt-5 text-xs font-medium text-accent">آخرین قدم</p>
                  <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black leading-10 outline-none">
                    شما و کسب‌وکارتان را بشناسیم
                  </h1>
                  <p className="mt-3 text-sm leading-8 text-muted">
                    این اطلاعات در داشبورد و پاسخ‌های پشتیبان استفاده می‌شوند و بعداً قابل ویرایش‌اند.
                  </p>

                  {profileError && <Alert variant="error" title={profileError} className="mt-5" />}

                  <form onSubmit={(event) => void completeOnboarding(event)} noValidate className="mt-7 space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Input
                        label="نام و نام خانوادگی"
                        placeholder="مثلاً سارا محمدی"
                        autoComplete="name"
                        startIcon={<User />}
                        value={fullName}
                        onChange={(event) => {
                          setFullName(event.target.value);
                          setProfileErrors((errors) => ({ ...errors, fullName: "" }));
                        }}
                        error={profileErrors.fullName}
                        required
                      />
                      <Input
                        label="نام کسب‌وکار"
                        placeholder="مثلاً فروشگاه نیلا"
                        autoComplete="organization"
                        startIcon={<Briefcase />}
                        value={businessName}
                        onChange={(event) => {
                          setBusinessName(event.target.value);
                          setProfileErrors((errors) => ({ ...errors, businessName: "" }));
                        }}
                        error={profileErrors.businessName}
                        required
                      />
                    </div>

                    <Select
                      label="کسب‌وکارتان در چه زمینه‌ای است؟"
                      placeholder="یک دسته انتخاب کنید"
                      searchable
                      searchPlaceholder="جستجوی دسته…"
                      options={CATEGORY_OPTIONS}
                      value={businessCategory}
                      onChange={(value) => {
                        setBusinessCategory(value);
                        setProfileErrors((errors) => ({
                          ...errors,
                          businessCategory: "",
                        }));
                      }}
                      error={profileErrors.businessCategory}
                      hint="با دانستن حوزه کارتان، پیشنهادها و پاسخ‌های پشتیبان را دقیق‌تر می‌کنیم."
                      required
                    />

                    {flow === "skip" && (
                      <Alert
                        title="تلگرام را بعداً وصل کنید"
                        description="هر زمان آماده بودید، اتصال ربات از داخل داشبورد در دسترس خواهد بود."
                      />
                    )}

                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                      <Button type="button" variant="ghost" onClick={goBack} startIcon={<ArrowRight className="size-4" />}>
                        قبلی
                      </Button>
                      <Button type="submit" loading={saving} className="flex-1" endIcon={<ArrowLeft className="size-4" />}>
                        ورود به داشبورد
                      </Button>
                    </div>
                  </form>
                </Slide>
              )}
            </AnimatePresence>
          </section>
        </div>

        <p className="mt-5 text-center text-xs leading-6 text-muted">
          برای اتصال ربات به مشکل خوردید؟ فعلاً رد کنید؛ بعداً از داشبورد ادامه می‌دهید.
        </p>
      </motion.div>
    </main>
  );
};
