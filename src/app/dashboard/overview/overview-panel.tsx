"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  Coins,
  GitBranch,
  HelpCircle,
  Inbox,
  MessageSquareText,
  Send,
  Sparkles,
  ToggleRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import {
  ReplyPipeline,
  stageCountHint,
  type PipelineStage,
} from "@/app/dashboard/overview/reply-pipeline";
import {
  faNumber,
  faTokens,
  RANGE_HINTS,
  TOKEN_CHART_SERIES,
  toTokenChartData,
  UsageFigure,
  UsageRangeTabs,
  useUsageSeries,
  type UsageRange,
} from "@/components/dashboard/usage";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chart } from "@/components/ui/chart";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";
import { useBusinessUsage } from "@/store/use-usage";

// ---------------------------------------------------------------------------
// Types mirrored from /api/dashboard/overview.
// ---------------------------------------------------------------------------

type Overview = {
  knowledge: { facts: number; qaPairs: number; sources: number };
  automation: { flows: number; activeFlows: number; preparedReplies: number };
  inbox: { openConversations: number; totalConversations: number };
  assistant: { enabled: boolean; handoffEnabled: boolean };
  telegram: {
    connected: boolean;
    botName: string;
    botUsername: string;
    ownerLinked: boolean;
  };
  business: { category: string; categoryLabel: string };
};

const StatCard = ({
  label,
  value,
  hint,
  icon,
  loading,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  loading: boolean;
  href?: string;
}) => {
  const body = (
    <>
      <div className="flex items-center gap-3">
        <Icon icon={icon} tile size="sm" tone="accent" className="shrink-0" />
        <span className="text-xs text-muted">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <p className="mt-3 text-2xl font-black tabular-nums">{value}</p>
      )}
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-3xl border border-line bg-surface/40 p-5">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-3xl border border-line bg-surface/40 p-5 transition-colors duration-300 hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {body}
    </Link>
  );
};

/** One row of the setup checklist: done, or a link to the page that does it. */
const SetupRow = ({
  done,
  title,
  description,
  href,
  actionLabel,
  icon: StepIcon,
}: {
  done: boolean;
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  icon: LucideIcon;
}) => (
  <li className="flex items-start gap-3.5 rounded-2xl border border-line bg-background/40 p-4">
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        done ? "bg-success/12 text-success" : "bg-card text-muted"
      )}
    >
      {done ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <StepIcon className="size-4" aria-hidden />
      )}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-6 text-muted">{description}</p>
    </div>
    {done ? (
      <Badge variant="success" className="mt-0.5 shrink-0 text-[10px]">
        انجام شد
      </Badge>
    ) : (
      href &&
      actionLabel && (
        <Link
          href={href}
          className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full text-xs font-medium text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {actionLabel}
          <ArrowLeft className="size-3.5" aria-hidden />
        </Link>
      )
    )}
  </li>
);

export const OverviewPanel = () => {
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const { usage } = useBusinessUsage();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [setupDismissed, setSetupDismissed] = React.useState(false);
  const [range, setRange] = React.useState<UsageRange>("week");
  const { points, totals, loading: seriesLoading } = useUsageSeries(
    { scope: "self" },
    range
  );

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/overview");
        const body = (await res.json()) as {
          overview?: Overview;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || "دریافت آمار ناموفق بود.");
        if (active) setOverview(body.overview ?? null);
      } catch (error) {
        if (active) {
          toast({
            title: "بارگذاری نمای کلی ناموفق بود",
            description: error instanceof Error ? error.message : undefined,
            variant: "error",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [toast]);

  const messageLimit = usage?.monthlyMessageLimit ?? null;
  const monthMessages = usage?.monthMessages ?? 0;
  const messagesLeft =
    usage?.messagesLeft ?? (messageLimit === null ? null : messageLimit);
  const usedRatio =
    messageLimit && messageLimit > 0
      ? Math.min(1, monthMessages / messageLimit)
      : 0;
  const usageLoading = usage === undefined;

  const knowledgeCount =
    (overview?.knowledge.facts ?? 0) + (overview?.knowledge.qaPairs ?? 0);

  const setupSteps = [
    {
      id: "telegram",
      done: overview?.telegram.connected ?? false,
      icon: Send,
      title: overview?.telegram.connected
        ? `ربات «${overview.telegram.botName}» متصل است`
        : "ربات تلگرام را وصل کنید",
      description: overview?.telegram.connected
        ? `مشتری‌ها از @${overview.telegram.botUsername} پاسخ می‌گیرند.`
        : "بدون ربات متصل، هیچ پیامی به دست مشتری نمی‌رسد.",
      href: "/dashboard/bot",
      actionLabel: "اتصال ربات",
    },
    {
      id: "assistant",
      done: overview?.assistant.enabled ?? false,
      icon: ToggleRight,
      title: "دستیار هوشمند را روشن کنید",
      description:
        "بعد از فلوها و کلیدواژه‌ها، دستیار به پرسش‌های باقی‌مانده پاسخ می‌دهد.",
      href: "/dashboard/assistant",
      actionLabel: "تنظیمات دستیار",
    },
    {
      id: "facts",
      done: (overview?.knowledge.facts ?? 0) > 0,
      icon: BookOpen,
      title: "اطلاعات کسب‌وکارتان را بنویسید",
      description:
        (overview?.knowledge.facts ?? 0) > 0
          ? `${fa(overview?.knowledge.facts ?? 0)} مورد اطلاعات ثبت شده است.`
          : "ساعت کاری، شرایط ارسال و هر چیزی که دستیار باید همیشه بداند.",
      href: "/dashboard/knowledge",
      actionLabel: "افزودن اطلاعات",
    },
    {
      id: "qa",
      done: (overview?.knowledge.qaPairs ?? 0) > 0,
      icon: HelpCircle,
      title: "پرسش‌های پرتکرار را پاسخ دهید",
      description:
        (overview?.knowledge.qaPairs ?? 0) > 0
          ? `${fa(overview?.knowledge.qaPairs ?? 0)} پرسش و پاسخ ثبت شده است.`
          : "پاسخ آماده برای سؤال‌هایی که مشتری‌ها بیشتر می‌پرسند.",
      href: "/dashboard/knowledge/qa",
      actionLabel: "افزودن پرسش",
    },
    {
      id: "automation",
      done:
        (overview?.automation.flows ?? 0) > 0 ||
        (overview?.automation.preparedReplies ?? 0) > 0,
      icon: GitBranch,
      title: "یک فلو یا کلیدواژه بسازید",
      description:
        (overview?.automation.flows ?? 0) > 0 ||
        (overview?.automation.preparedReplies ?? 0) > 0
          ? `${fa(overview?.automation.flows ?? 0)} فلو و ${fa(
              overview?.automation.preparedReplies ?? 0
            )} کلیدواژه دارید.`
          : "پرتکرارترین مسیرها را بدون مصرف توکن پاسخ دهید.",
      href: "/dashboard/automation",
      actionLabel: "ساخت فلو",
    },
    {
      id: "owner",
      done: overview?.telegram.ownerLinked ?? false,
      icon: Bot,
      title: "تلگرام شخصی خود را وصل کنید",
      description:
        "تا وقتی دستیار پاسخی ندارد، پیام مشتری در تلگرام به دست شما برسد.",
      href: "/dashboard/bot/admins",
      actionLabel: "اتصال حساب",
    },
  ] satisfies Array<{
    id: string;
    done: boolean;
    icon: LucideIcon;
    title: string;
    description: string;
    href?: string;
    actionLabel?: string;
  }>;
  const pipelineStages: PipelineStage[] = [
    {
      label: "ربات تلگرام",
      hint: overview?.telegram.connected
        ? `@${overview.telegram.botUsername}`
        : "متصل نیست",
      href: "/dashboard/bot",
      icon: Send,
      active: overview?.telegram.connected ?? false,
    },
    {
      label: "فلوها",
      hint: stageCountHint(overview?.automation.activeFlows ?? 0, "فعال"),
      href: "/dashboard/automation",
      icon: GitBranch,
      active: (overview?.automation.activeFlows ?? 0) > 0,
    },
    {
      label: "کلیدواژه‌ها",
      hint: stageCountHint(overview?.automation.preparedReplies ?? 0, "پاسخ"),
      href: "/dashboard/automation/keywords",
      icon: MessageSquareText,
      active: (overview?.automation.preparedReplies ?? 0) > 0,
    },
    {
      label: "دستیار هوشمند",
      hint: overview?.assistant.enabled ? "روشن" : "خاموش",
      href: "/dashboard/assistant",
      icon: Sparkles,
      active: overview?.assistant.enabled ?? false,
    },
    {
      label: "پشتیبان انسانی",
      hint: overview?.assistant.handoffEnabled ? "روشن" : "خاموش",
      href: "/dashboard/inbox",
      icon: Inbox,
      active: overview?.assistant.handoffEnabled ?? false,
    },
  ];

  const pendingSetupSteps = setupSteps.filter((step) => !step.done);
  const showSetup = !setupDismissed && (loading || pendingSetupSteps.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black">نمای کلی</h1>
          {overview?.business.categoryLabel && (
            <Badge variant="muted" className="text-[10px]">
              {overview.business.categoryLabel}
            </Badge>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
          وضعیت دستیار هوشمند شما در یک نگاه — پیام‌های این ماه، مصرف توکن و
          کارهایی که راه‌اندازی را کامل می‌کنند.
        </p>
      </header>

      <div className="space-y-8">
        <ReplyPipeline stages={pipelineStages} loading={loading} />

        <AnimatePresence initial={false}>
          {showSetup && (
            <motion.section
              key="setup-checklist"
              aria-labelledby="overview-setup-heading"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduce ? 0 : 0.28, ease: luxe }}
              className="rounded-3xl border border-accent/20 bg-surface/40 p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Icon icon={Sparkles} tile size="sm" tone="accent" />
                  <div className="min-w-0">
                    <h2 id="overview-setup-heading" className="text-lg font-bold">
                      قدم‌های بعدی برای راه‌اندازی
                    </h2>
                    <p className="mt-1 text-xs leading-6 text-muted">
                      {loading
                        ? "در حال بررسی وضعیت راه‌اندازی…"
                        : `${fa(setupSteps.length - pendingSetupSteps.length)} از ${fa(
                            setupSteps.length
                          )} قدم انجام شده — این‌ها باقی مانده است.`}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="بستن راهنمای راه‌اندازی"
                  title="بستن راهنمای راه‌اندازی"
                  onClick={() => setSetupDismissed(true)}
                  className="shrink-0 text-muted"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>

              <ul className="mt-5 space-y-2" aria-busy={loading}>
                {pendingSetupSteps.map((step) => (
                  <SetupRow key={step.id} {...step} />
                ))}
              </ul>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Message quota — the number a business checks first. */}
        <section
          aria-label="سهمیه پیام این ماه"
          className="rounded-3xl border border-line bg-surface/40 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2.5 text-sm font-bold">
                <MessageSquareText className="size-4 text-muted" aria-hidden />
                پیام‌های این ماه
              </h2>
              <p className="mt-1 text-xs leading-6 text-muted">
                هر پاسخ هوشمندی که دستیار برای مشتری می‌فرستد یک پیام حساب
                می‌شود.
              </p>
            </div>
            {usageLoading ? (
              <Skeleton className="h-9 w-28" />
            ) : (
              <p className="shrink-0 text-3xl font-black tabular-nums">
                {fa(monthMessages)}
                {messageLimit !== null && (
                  <span className="text-base font-bold text-muted">
                    {" "}
                    از {fa(messageLimit)}
                  </span>
                )}
              </p>
            )}
          </div>

          {!usageLoading && messageLimit !== null && (
            <>
              <div
                role="progressbar"
                aria-label="پیام‌های مصرف‌شده این ماه"
                aria-valuemin={0}
                aria-valuemax={messageLimit}
                aria-valuenow={monthMessages}
                className="mt-5 h-2 overflow-hidden rounded-full bg-line/60"
              >
                <motion.div
                  initial={false}
                  animate={{ width: `${Math.max(2, Math.round(usedRatio * 100))}%` }}
                  transition={
                    reduce ? { duration: 0 } : { duration: 0.6, ease: luxe }
                  }
                  className={cn(
                    "h-full rounded-full",
                    messagesLeft === 0
                      ? "bg-danger"
                      : usedRatio >= 0.75
                        ? "bg-warning"
                        : "bg-accent"
                  )}
                />
              </div>
              <p className="mt-3 text-xs leading-6 text-muted">
                {usage?.aiBlocked
                  ? "دستیار این حساب توسط مدیر سایت مسدود شده است."
                  : messagesLeft === 0
                    ? "سقف این ماه پر شده است؛ برای افزایش سهمیه با ما تماس بگیرید."
                    : `${fa(messagesLeft ?? 0)} پیام باقی مانده — سهمیه ابتدای هر ماه بازنشانی می‌شود.`}
              </p>
            </>
          )}

          {!usageLoading && messageLimit === null && (
            <p className="mt-5 text-xs leading-6 text-muted">
              سهمیه پیام این حساب نامحدود است.
            </p>
          )}
        </section>

        <section
          aria-label="آمار کلی"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            label="گفتگوهای باز"
            value={fa(overview?.inbox.openConversations ?? 0)}
            hint="منتظر پاسخ شما در صندوق پیام‌ها"
            icon={Inbox}
            loading={loading}
            href="/dashboard/inbox"
          />
          <StatCard
            label="دانش کسب‌وکار"
            value={fa(knowledgeCount)}
            hint="اطلاعات و پرسش‌وپاسخ ثبت‌شده"
            icon={BookOpen}
            loading={loading}
            href="/dashboard/knowledge"
          />
          <StatCard
            label="فلوهای فعال"
            value={fa(overview?.automation.activeFlows ?? 0)}
            hint="گفتگوهای خودکار تلگرام"
            icon={GitBranch}
            loading={loading}
            href="/dashboard/automation"
          />
          <StatCard
            label="توکن این ماه"
            value={faTokens(usage?.monthTokens ?? 0)}
            hint="ورودی و خروجی مدل"
            icon={Coins}
            loading={usageLoading}
          />
        </section>

        {/* Token usage over time */}
        <section
          aria-label="روند مصرف توکن"
          className="rounded-3xl border border-line bg-surface/40 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-bold">روند مصرف توکن</h2>
              <p className="mt-1 text-xs leading-6 text-muted">
                توکن ورودی پرسش‌ها و توکن خروجی پاسخ‌ها — {RANGE_HINTS[range]}
              </p>
            </div>
            <UsageRangeTabs
              value={range}
              onChange={setRange}
              disabled={seriesLoading}
            />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <UsageFigure
              label="توکن ورودی"
              value={faTokens(totals.promptTokens)}
              tone="accent"
            />
            <UsageFigure
              label="توکن خروجی"
              value={faTokens(totals.completionTokens)}
              tone="success"
            />
            <UsageFigure
              label="مجموع توکن"
              value={faTokens(totals.totalTokens)}
            />
            <UsageFigure label="پیام‌ها" value={faNumber(totals.messages)} />
          </dl>

          <div className="mt-6">
            <Chart
              data={toTokenChartData(points)}
              series={TOKEN_CHART_SERIES}
              xKey="label"
              stacked
              height={260}
              loading={seriesLoading}
              formatValue={faTokens}
              emptyText="در این بازه هنوز پاسخی ثبت نشده است."
              ariaLabel={`مصرف توکن ورودی و خروجی کسب‌وکار شما در ${RANGE_HINTS[range]}`}
            />
          </div>
        </section>

        {(overview?.assistant.enabled ?? false) === false && !loading && (
          <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-10 text-center">
            <Icon icon={Sparkles} tile size="lg" tone="accent" />
            <h2 className="mt-5 text-lg font-bold">دستیار شما خاموش است</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">
              با روشن کردن دستیار، پرسش‌هایی که فلوها و پیام‌های آماده پاسخ
              نمی‌دهند به هوش مصنوعی سپرده می‌شوند.
            </p>
            <Link
              href="/dashboard/assistant"
              className={buttonVariants({ className: "mt-6" })}
            >
              رفتن به تنظیمات دستیار
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
};
