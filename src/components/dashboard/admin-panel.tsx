"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  BarChart3,
  Coins,
  Cpu,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  type LucideIcon,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
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
import { Button } from "@/components/ui/button";
import { Chart } from "@/components/ui/chart";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types mirrored from the /api/admin routes.
// ---------------------------------------------------------------------------

type Business = {
  id: string;
  email: string;
  fullName: string;
  businessName: string;
  isAdmin: boolean;
  createdAt: string;
  aiEnabled: boolean;
  monthPromptTokens: number;
  monthCompletionTokens: number;
  monthTokens: number;
  monthMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalMessages: number;
  monthlyTokenLimit: number | null;
  monthlyMessageLimit: number | null;
  aiBlocked: boolean;
};

type PlatformTotals = {
  monthPromptTokens: number;
  monthCompletionTokens: number;
  monthTokens: number;
  monthMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalMessages: number;
};

type GlobalSettings = {
  aiEnabled: boolean;
  qaMinSimilarity: number;
  chunkMinSimilarity: number;
  chunkMatchCount: number;
  qaMatchCount: number;
  intentEnabled: boolean;
  chatModel: string;
};

type ModelChoice = {
  model: string;
  provider: "openai" | "nvidia-nim";
  configured: boolean;
};

const PROVIDER_LABELS: Record<ModelChoice["provider"], string> = {
  openai: "OpenAI / متیس",
  "nvidia-nim": "NVIDIA NIM",
};

// ---------------------------------------------------------------------------
// Shared data loading — each admin sub-page fetches what it needs.
// ---------------------------------------------------------------------------

type BusinessesData = {
  businesses: Business[];
  totals: PlatformTotals | null;
  setupRequired: boolean;
};

const useAdminBusinesses = () => {
  const { toast } = useToast();
  const [data, setData] = React.useState<BusinessesData>({
    businesses: [],
    totals: null,
    setupRequired: false,
  });
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/admin/businesses");
        const body = (await res.json()) as {
          businesses?: Business[];
          totals?: PlatformTotals;
          error?: string;
          setupRequired?: boolean;
        };
        if (!res.ok) {
          setData((prev) => ({
            ...prev,
            setupRequired: body.setupRequired === true,
          }));
          throw new Error(body.error || "دریافت اطلاعات ناموفق بود.");
        }
        setData({
          businesses: body.businesses ?? [],
          totals: body.totals ?? null,
          setupRequired: false,
        });
      } catch (error) {
        toast({
          title: "بارگذاری اطلاعات ناموفق بود",
          description: error instanceof Error ? error.message : undefined,
          variant: "error",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const applyLimits = React.useCallback(
    (
      userId: string,
      limits: {
        monthlyTokenLimit: number | null;
        monthlyMessageLimit: number | null;
        aiBlocked: boolean;
      }
    ) => {
      setData((prev) => ({
        ...prev,
        businesses: prev.businesses.map((b) =>
          b.id === userId ? { ...b, ...limits } : b
        ),
      }));
    },
    []
  );

  return { ...data, loading, refreshing, load, applyLimits };
};

// ---------------------------------------------------------------------------
// Shared page chrome
// ---------------------------------------------------------------------------

const AdminPageHeader = ({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: React.ReactNode;
}) => (
  <header className="mb-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <Icon icon={icon} tile size="md" tone="accent" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black">{title}</h1>
            <Badge variant="accent" className="text-[10px]">
              مدیر سایت
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            {description}
          </p>
        </div>
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </div>
  </header>
);

const SetupRequiredAlert = () => (
  <div
    role="alert"
    className="mb-6 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm leading-7"
  >
    راه‌اندازی بخش مدیریت کامل نشده است. فایل{" "}
    <code dir="ltr" className="rounded-md bg-background/60 px-1.5 py-0.5 text-xs">
      supabase/admin.sql
    </code>{" "}
    را در Supabase SQL Editor اجرا کنید و سپس حساب خود را با{" "}
    <code dir="ltr" className="rounded-md bg-background/60 px-1.5 py-0.5 text-xs">
      is_admin = true
    </code>{" "}
    مدیر کنید.
  </div>
);

const RefreshButton = ({
  loading,
  refreshing,
  onRefresh,
}: {
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) => (
  <Button
    type="button"
    variant="secondary"
    onClick={onRefresh}
    disabled={loading || refreshing}
    startIcon={
      <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
    }
    className="w-full sm:w-auto"
  >
    به‌روزرسانی
  </Button>
);

// ---------------------------------------------------------------------------
// Usage overview panel — /dashboard/admin
// ---------------------------------------------------------------------------

const StatCard = ({
  label,
  value,
  hint,
  icon,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  loading: boolean;
}) => (
  <div className="rounded-3xl border border-line bg-surface/40 p-5">
    <div className="flex items-center gap-3">
      <Icon icon={icon} tile size="sm" tone="accent" className="shrink-0" />
      <span className="text-xs text-muted">{label}</span>
    </div>
    {loading ? (
      <Skeleton className="mt-3 h-7 w-24" />
    ) : (
      <p className="mt-3 text-2xl font-black tabular-nums">{value}</p>
    )}
    <p className="mt-1 text-xs text-muted">{hint}</p>
  </div>
);

/**
 * Token chart with its own range switcher. Used both for the whole platform
 * and, inside the business modal, for a single account.
 */
const UsageChartCard = ({
  target,
  title,
  description,
  height = 280,
}: {
  target: { scope: "platform" } | { scope: "business"; userId: string };
  title: string;
  description: string;
  height?: number;
}) => {
  const [range, setRange] = React.useState<UsageRange>("week");
  const { points, totals, loading } = useUsageSeries(target, range);

  return (
    <section
      aria-label={title}
      className="rounded-3xl border border-line bg-surface/40 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="mt-1 text-xs leading-6 text-muted">
            {description} — {RANGE_HINTS[range]}
          </p>
        </div>
        <UsageRangeTabs value={range} onChange={setRange} disabled={loading} />
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
        <UsageFigure label="مجموع توکن" value={faTokens(totals.totalTokens)} />
        <UsageFigure label="پیام‌ها" value={faNumber(totals.messages)} />
      </dl>

      <div className="mt-6">
        <Chart
          data={toTokenChartData(points)}
          series={TOKEN_CHART_SERIES}
          xKey="label"
          stacked
          height={height}
          loading={loading}
          formatValue={faTokens}
          emptyText="در این بازه مصرفی ثبت نشده است."
          ariaLabel={`${title} — توکن ورودی و خروجی در ${RANGE_HINTS[range]}`}
        />
      </div>
    </section>
  );
};

export const AdminUsagePanel = () => {
  const { businesses, totals, setupRequired, loading, refreshing, load } =
    useAdminBusinesses();

  // Heaviest consumers this month, highest first — only rows with any usage.
  const topBusinesses = React.useMemo(
    () =>
      [...businesses]
        .filter((b) => b.monthTokens > 0 || b.monthMessages > 0)
        .sort((a, b) => b.monthTokens - a.monthTokens)
        .slice(0, 8),
    [businesses]
  );
  const maxMonthTokens = topBusinesses[0]?.monthTokens ?? 0;

  return (
    <>
      <AdminPageHeader
        title="مصرف و آمار"
        description="نمای کلی مصرف توکن و پیام هوش مصنوعی در کل پلتفرم و پرمصرف‌ترین کسب‌وکارها."
        icon={BarChart3}
        action={
          <RefreshButton
            loading={loading}
            refreshing={refreshing}
            onRefresh={() => void load(true)}
          />
        }
      />

      {setupRequired && <SetupRequiredAlert />}

      <div className="space-y-8">
        <section
          aria-label="مصرف این ماه در کل پلتفرم"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            label="توکن ورودی این ماه"
            value={faTokens(totals?.monthPromptTokens ?? 0)}
            hint="پرسش‌ها و دانش ارسال‌شده به مدل"
            icon={ArrowUpFromLine}
            loading={loading}
          />
          <StatCard
            label="توکن خروجی این ماه"
            value={faTokens(totals?.monthCompletionTokens ?? 0)}
            hint="پاسخ‌های تولیدشده توسط مدل"
            icon={ArrowDownToLine}
            loading={loading}
          />
          <StatCard
            label="پیام این ماه"
            value={fa(totals?.monthMessages ?? 0)}
            hint="پاسخ‌های هوشمند ارسال‌شده"
            icon={MessageSquareText}
            loading={loading}
          />
          <StatCard
            label="کسب‌وکارها"
            value={fa(businesses.length)}
            hint="حساب‌های ثبت‌نام‌شده"
            icon={Store}
            loading={loading}
          />
        </section>

        <UsageChartCard
          target={{ scope: "platform" }}
          title="روند مصرف توکن"
          description="مجموع همه کسب‌وکارها"
        />

        <section
          aria-labelledby="admin-alltime-heading"
          className="rounded-3xl border border-line bg-surface/40 p-5 sm:p-6"
        >
          <h2
            id="admin-alltime-heading"
            className="flex items-center gap-2.5 text-sm font-bold"
          >
            <Coins className="size-4 text-muted" aria-hidden />
            از ابتدای راه‌اندازی
          </h2>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <UsageFigure
              label="توکن ورودی"
              value={faTokens(totals?.totalPromptTokens ?? 0)}
              tone="accent"
            />
            <UsageFigure
              label="توکن خروجی"
              value={faTokens(totals?.totalCompletionTokens ?? 0)}
              tone="success"
            />
            <UsageFigure
              label="مجموع توکن"
              value={faTokens(totals?.totalTokens ?? 0)}
            />
            <UsageFigure
              label="پیام‌ها"
              value={faNumber(totals?.totalMessages ?? 0)}
            />
          </dl>
        </section>

        <section aria-labelledby="admin-top-usage-heading">
          <h2 id="admin-top-usage-heading" className="mb-4 text-lg font-bold">
            پرمصرف‌ترین‌ها در این ماه
          </h2>

          {loading && (
            <div role="status" aria-label="در حال بارگذاری آمار" className="space-y-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-2xl border border-line bg-surface/35 p-4">
                  <SkeletonText lines={1} />
                </div>
              ))}
            </div>
          )}

          {!loading && topBusinesses.length === 0 && (
            <div className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
              <Icon icon={BarChart3} tile size="lg" tone="muted" />
              <p className="mt-5 text-sm leading-7 text-muted">
                در این ماه هنوز مصرفی ثبت نشده است.
              </p>
            </div>
          )}

          {!loading && topBusinesses.length > 0 && (
            <ul className="space-y-2">
              {topBusinesses.map((business) => (
                <li
                  key={business.id}
                  className="rounded-2xl border border-line bg-surface/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">
                      {business.businessName || business.email}
                    </p>
                    <p className="text-xs tabular-nums text-muted">
                      {faTokens(business.monthTokens)} توکن ·{" "}
                      {fa(business.monthMessages)} پیام
                    </p>
                  </div>
                  {/* Relative usage bar against this month's heaviest consumer. */}
                  <div
                    aria-hidden
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/60"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${
                          maxMonthTokens > 0
                            ? Math.max(
                                4,
                                Math.round(
                                  (business.monthTokens / maxMonthTokens) * 100
                                )
                              )
                            : 4
                        }%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Per-business limits modal
// ---------------------------------------------------------------------------

const LimitsModal = ({
  business,
  onOpenChange,
  onSaved,
}: {
  business: Business | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (
    userId: string,
    limits: {
      monthlyTokenLimit: number | null;
      monthlyMessageLimit: number | null;
      aiBlocked: boolean;
    }
  ) => void;
}) => {
  const { toast } = useToast();
  const [tokenLimit, setTokenLimit] = React.useState("");
  const [messageLimit, setMessageLimit] = React.useState("");
  const [blocked, setBlocked] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!business) return;
    setTokenLimit(
      business.monthlyTokenLimit === null ? "" : String(business.monthlyTokenLimit)
    );
    setMessageLimit(
      business.monthlyMessageLimit === null
        ? ""
        : String(business.monthlyMessageLimit)
    );
    setBlocked(business.aiBlocked);
  }, [business]);

  const save = async () => {
    if (!business) return;

    const parseField = (raw: string): number | null | undefined => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const value = Number(trimmed);
      return Number.isInteger(value) && value >= 0 ? value : undefined;
    };
    const parsedTokens = parseField(tokenLimit);
    const parsedMessages = parseField(messageLimit);
    if (parsedTokens === undefined || parsedMessages === undefined) {
      toast({
        title: "سقف باید عدد صحیح و نامنفی باشد",
        description: "برای نامحدود، فیلد را خالی بگذارید.",
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/businesses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: business.id,
          monthlyTokenLimit: parsedTokens,
          monthlyMessageLimit: parsedMessages,
          aiBlocked: blocked,
        }),
      });
      const data = (await res.json()) as { limits?: unknown; error?: string };
      if (!res.ok || !data.limits) {
        throw new Error(data.error || "ذخیره ناموفق بود.");
      }
      onSaved(business.id, {
        monthlyTokenLimit: parsedTokens,
        monthlyMessageLimit: parsedMessages,
        aiBlocked: blocked,
      });
      onOpenChange(false);
      toast({ title: "محدودیت‌ها ذخیره شد", variant: "success" });
    } catch (error) {
      toast({
        title: "ذخیره محدودیت‌ها ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={business !== null} onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>محدودیت‌های مصرف</ModalTitle>
          <ModalDescription>
            {business?.businessName || business?.email || ""} — سقف ماهانه
            مصرف؛ فیلد خالی یعنی نامحدود.
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-4">
          <Input
            label="سقف توکن در ماه"
            hint={
              business && business.monthTokens > 0
                ? `مصرف این ماه: ${faTokens(business.monthTokens)} توکن`
                : "خالی = نامحدود"
            }
            inputMode="numeric"
            value={tokenLimit}
            onChange={(e) => setTokenLimit(e.target.value)}
            placeholder="مثلاً 500000"
          />
          <Input
            label="سقف پیام در ماه"
            hint={
              business && business.monthMessages > 0
                ? `پیام‌های این ماه: ${fa(business.monthMessages)} — هر ثبت‌نام با ۲۰ پیام شروع می‌شود`
                : "خالی = نامحدود؛ هر ثبت‌نام با ۲۰ پیام در ماه شروع می‌شود"
            }
            inputMode="numeric"
            value={messageLimit}
            onChange={(e) => setMessageLimit(e.target.value)}
            placeholder="مثلاً 1000"
          />
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-background/40 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">مسدود کردن هوش مصنوعی</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                این کسب‌وکار تا رفع مسدودی هیچ پاسخ هوشمندی نمی‌گیرد.
              </p>
            </div>
            <Switch
              checked={blocked}
              onChange={(e) => setBlocked(e.target.checked)}
              aria-label="مسدود کردن هوش مصنوعی این کسب‌وکار"
            />
          </div>
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            انصراف
          </Button>
          <Button type="button" onClick={() => void save()} loading={saving}>
            ذخیره
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Businesses panel — /dashboard/admin/businesses
// ---------------------------------------------------------------------------

/** Per-business usage: input/output tokens over a switchable range. */
const BusinessUsageModal = ({
  business,
  onOpenChange,
}: {
  business: Business | null;
  onOpenChange: (open: boolean) => void;
}) => (
  <Modal open={business !== null} onOpenChange={onOpenChange}>
    <ModalContent size="lg">
      <ModalHeader>
        <ModalTitle>مصرف کسب‌وکار</ModalTitle>
        <ModalDescription>
          {business?.businessName || business?.email || ""} — توکن ورودی و
          خروجی این حساب در بازه انتخابی.
        </ModalDescription>
      </ModalHeader>

      {business && (
        <div className="space-y-4">
          <UsageChartCard
            target={{ scope: "business", userId: business.id }}
            title="روند مصرف توکن"
            description="فقط این کسب‌وکار"
            height={230}
          />
          <section
            aria-label="مصرف کل این کسب‌وکار"
            className="rounded-3xl border border-line bg-background/40 p-5"
          >
            <h3 className="text-sm font-bold">از ابتدای راه‌اندازی</h3>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <UsageFigure
                label="توکن ورودی"
                value={faTokens(business.totalPromptTokens)}
                tone="accent"
              />
              <UsageFigure
                label="توکن خروجی"
                value={faTokens(business.totalCompletionTokens)}
                tone="success"
              />
              <UsageFigure
                label="مجموع توکن"
                value={faTokens(business.totalTokens)}
              />
              <UsageFigure
                label="پیام‌ها"
                value={faNumber(business.totalMessages)}
              />
            </dl>
          </section>
        </div>
      )}

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          بستن
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

const BusinessRow = ({
  business,
  onEditLimits,
  onViewUsage,
}: {
  business: Business;
  onEditLimits: () => void;
  onViewUsage: () => void;
}) => {
  const reduce = useReducedMotion();
  const hasLimit =
    business.monthlyTokenLimit !== null || business.monthlyMessageLimit !== null;

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
      className="rounded-2xl border border-line bg-surface/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold">
              {business.businessName || "بدون نام کسب‌وکار"}
            </p>
            {business.isAdmin && (
              <Badge variant="accent" className="text-[10px]">
                مدیر سایت
              </Badge>
            )}
            {business.aiBlocked ? (
              <Badge variant="error" className="text-[10px]" dot>
                مسدود
              </Badge>
            ) : business.aiEnabled ? (
              <Badge variant="success" className="text-[10px]" dot>
                دستیار روشن
              </Badge>
            ) : (
              <Badge variant="muted" className="text-[10px]">
                دستیار خاموش
              </Badge>
            )}
          </div>
          <p dir="ltr" className="mt-1 truncate text-start text-xs text-muted">
            {business.email}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip content="نمودار مصرف" side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onViewUsage}
              aria-label={`نمودار مصرف ${business.businessName || business.email}`}
            >
              <BarChart3 className="size-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content="ویرایش محدودیت‌ها" side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onEditLimits}
              aria-label={`ویرایش محدودیت‌های ${business.businessName || business.email}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt className="text-muted">توکن ورودی این ماه</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {faTokens(business.monthPromptTokens)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">توکن خروجی این ماه</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {faTokens(business.monthCompletionTokens)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">مجموع توکن این ماه</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {faTokens(business.monthTokens)}
            {business.monthlyTokenLimit !== null && (
              <span className="text-muted">
                {" "}از {faTokens(business.monthlyTokenLimit)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">پیام این ماه</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {fa(business.monthMessages)}
            {business.monthlyMessageLimit !== null && (
              <span className="text-muted">
                {" "}از {fa(business.monthlyMessageLimit)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">محدودیت</dt>
          <dd className="mt-0.5 font-medium">
            {business.aiBlocked ? (
              <span className="text-danger">مسدود</span>
            ) : hasLimit ? (
              "دارد"
            ) : (
              <span className="text-muted">نامحدود</span>
            )}
          </dd>
        </div>
      </dl>
    </motion.li>
  );
};

export const AdminBusinessesPanel = () => {
  const {
    businesses,
    setupRequired,
    loading,
    refreshing,
    load,
    applyLimits,
  } = useAdminBusinesses();
  const [query, setQuery] = React.useState("");
  const [editingBusiness, setEditingBusiness] = React.useState<Business | null>(
    null
  );
  const [usageBusiness, setUsageBusiness] = React.useState<Business | null>(
    null
  );

  const filteredBusinesses = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return businesses;
    return businesses.filter(
      (b) =>
        b.businessName.toLowerCase().includes(needle) ||
        b.fullName.toLowerCase().includes(needle) ||
        b.email.toLowerCase().includes(needle)
    );
  }, [businesses, query]);

  return (
    <>
      <AdminPageHeader
        title="کسب‌وکارها"
        description="حساب‌های ثبت‌نام‌شده، وضعیت دستیار هر کدام و سقف ماهانه توکن و پیام."
        icon={Store}
        action={
          <RefreshButton
            loading={loading}
            refreshing={refreshing}
            onRefresh={() => void load(true)}
          />
        }
      />

      {setupRequired && <SetupRequiredAlert />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {!loading && (
            <Badge variant="muted">{fa(filteredBusinesses.length)} مورد</Badge>
          )}
        </div>
        <div className="w-full sm:max-w-xs">
          <Input
            aria-label="جستجوی کسب‌وکار"
            placeholder="جستجو بر اساس نام یا ایمیل…"
            startIcon={<Search aria-hidden />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <div role="status" aria-label="در حال بارگذاری کسب‌وکارها" className="space-y-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl border border-line bg-surface/35 p-4">
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
      )}

      {!loading && filteredBusinesses.length === 0 && (
        <div className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
          <Icon icon={query ? Search : Ban} tile size="lg" tone="muted" />
          <p className="mt-5 text-sm leading-7 text-muted">
            {query
              ? "کسب‌وکاری با این مشخصات پیدا نشد."
              : "هنوز کسب‌وکاری ثبت‌نام نکرده است."}
          </p>
        </div>
      )}

      {!loading && filteredBusinesses.length > 0 && (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {filteredBusinesses.map((business) => (
              <BusinessRow
                key={business.id}
                business={business}
                onEditLimits={() => setEditingBusiness(business)}
                onViewUsage={() => setUsageBusiness(business)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <LimitsModal
        business={editingBusiness}
        onOpenChange={(open) => {
          if (!open) setEditingBusiness(null);
        }}
        onSaved={applyLimits}
      />

      <BusinessUsageModal
        business={usageBusiness}
        onOpenChange={(open) => {
          if (!open) setUsageBusiness(null);
        }}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Global AI settings panel — /dashboard/admin/settings
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_OPTION: SelectOption = {
  value: "",
  label: "پیش‌فرض سرور",
  description: "همان مدلی که در متغیرهای محیطی تعریف شده است",
};

export const AdminSettingsPanel = () => {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<GlobalSettings | null>(null);
  const [models, setModels] = React.useState<ModelChoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [setupRequired, setSetupRequired] = React.useState(false);
  const [draft, setDraft] = React.useState<GlobalSettings | null>(null);
  const [qaSim, setQaSim] = React.useState("");
  const [chunkSim, setChunkSim] = React.useState("");
  const [chunkCount, setChunkCount] = React.useState("");
  const [qaCount, setQaCount] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = (await res.json()) as {
          settings?: GlobalSettings;
          models?: ModelChoice[];
          setupRequired?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "دریافت تنظیمات ناموفق بود.");
        if (data.settings) setSettings(data.settings);
        setModels(data.models ?? []);
        setSetupRequired(data.setupRequired === true);
      } catch (error) {
        toast({
          title: "بارگذاری تنظیمات ناموفق بود",
          description: error instanceof Error ? error.message : undefined,
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    };
    void loadSettings();
  }, [toast]);

  React.useEffect(() => {
    if (!settings) return;
    setDraft(settings);
    setQaSim(String(settings.qaMinSimilarity));
    setChunkSim(String(settings.chunkMinSimilarity));
    setChunkCount(String(settings.chunkMatchCount));
    setQaCount(String(settings.qaMatchCount));
  }, [settings]);

  const save = async () => {
    if (!draft) return;

    const qaMinSimilarity = Number(qaSim);
    const chunkMinSimilarity = Number(chunkSim);
    const chunkMatchCount = Number(chunkCount);
    const qaMatchCount = Number(qaCount);
    if (
      !Number.isFinite(qaMinSimilarity) || qaMinSimilarity < 0 || qaMinSimilarity > 1 ||
      !Number.isFinite(chunkMinSimilarity) || chunkMinSimilarity < 0 || chunkMinSimilarity > 1
    ) {
      toast({
        title: "آستانه شباهت باید عددی بین ۰ و ۱ باشد",
        variant: "error",
      });
      return;
    }
    if (
      !Number.isInteger(chunkMatchCount) || chunkMatchCount < 1 || chunkMatchCount > 10 ||
      !Number.isInteger(qaMatchCount) || qaMatchCount < 1 || qaMatchCount > 5
    ) {
      toast({
        title: "تعداد نتایج معتبر نیست",
        description: "قطعه دانش بین ۱ تا ۱۰ و پرسش‌وپاسخ بین ۱ تا ۵.",
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEnabled: draft.aiEnabled,
          intentEnabled: draft.intentEnabled,
          chatModel: draft.chatModel,
          qaMinSimilarity,
          chunkMinSimilarity,
          chunkMatchCount,
          qaMatchCount,
        }),
      });
      const data = (await res.json()) as {
        settings?: GlobalSettings;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || "ذخیره ناموفق بود.");
      }
      setSettings(data.settings);
      toast({ title: "تنظیمات سراسری ذخیره شد", variant: "success" });
    } catch (error) {
      toast({
        title: "ذخیره تنظیمات ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="تنظیمات هوش مصنوعی"
        description="کلیدها و مقدارهای سراسری که روی همه کسب‌وکارها اعمال می‌شوند — برای آزمایش کیفیت بازیابی دانش (RAG) قابل تغییرند."
        icon={SlidersHorizontal}
      />

      {setupRequired && <SetupRequiredAlert />}

      {loading || !draft ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <section
            aria-label="کلیدهای سراسری"
            className="grid gap-3 sm:grid-cols-2"
          >
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">هوش مصنوعی کل سایت</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  با خاموش کردن، هیچ کسب‌وکاری پاسخ هوشمند نمی‌گیرد.
                </p>
              </div>
              <Switch
                checked={draft.aiEnabled}
                onChange={(e) =>
                  setDraft({ ...draft, aiEnabled: e.target.checked })
                }
                aria-label="روشن یا خاموش کردن هوش مصنوعی کل سایت"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/40 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">تشخیص موضوع پرسش</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  فراخوان کم‌هزینه‌ای که دسته پرسش را حدس می‌زند و جستجو را
                  دقیق‌تر می‌کند.
                </p>
              </div>
              <Switch
                checked={draft.intentEnabled}
                onChange={(e) =>
                  setDraft({ ...draft, intentEnabled: e.target.checked })
                }
                aria-label="روشن یا خاموش کردن تشخیص موضوع"
              />
            </div>
          </section>

          <section
            aria-labelledby="admin-model-heading"
            className="rounded-3xl border border-line bg-surface/40 p-6"
          >
            <h2
              id="admin-model-heading"
              className="flex items-center gap-2.5 text-sm font-bold"
            >
              <Cpu className="size-4 text-muted" aria-hidden />
              مدل پاسخ‌دهی به مشتری
            </h2>
            <p className="mt-1 text-xs leading-6 text-muted">
              مدلی که برای همه کسب‌وکارها پاسخ مشتری را می‌نویسد. با انتخاب
              «پیش‌فرض سرور» همان مدل تعریف‌شده در متغیرهای محیطی استفاده
              می‌شود. مدل‌های بدون کلید API در این محیط غیرفعال‌اند.
            </p>
            <div className="mt-5 max-w-md">
              <Select
                label="مدل هوش مصنوعی"
                searchable
                value={draft.chatModel}
                onChange={(value) => setDraft({ ...draft, chatModel: value })}
                hint={
                  draft.chatModel
                    ? "این مدل روی همه پاسخ‌های تلگرام اعمال می‌شود."
                    : "بدون انتخاب، ترتیب پیش‌فرض ارائه‌دهنده‌ها حفظ می‌شود."
                }
                options={[
                  DEFAULT_MODEL_OPTION,
                  ...models.map((choice) => ({
                    value: choice.model,
                    label: choice.model,
                    description: choice.configured
                      ? PROVIDER_LABELS[choice.provider]
                      : `${PROVIDER_LABELS[choice.provider]} — کلید API تنظیم نشده`,
                    disabled: !choice.configured,
                  })),
                ]}
              />
            </div>
          </section>

          <section
            aria-labelledby="admin-retrieval-heading"
            className="rounded-3xl border border-line bg-surface/40 p-6"
          >
            <h2 id="admin-retrieval-heading" className="text-sm font-bold">
              تنظیمات بازیابی دانش
            </h2>
            <p className="mt-1 text-xs leading-6 text-muted">
              آستانه پایین‌تر یعنی نتایج بیشتر اما نامرتبط‌تر؛ برای آزمایش، این
              مقدارها را کم‌کم تغییر دهید و در «تست RAG» نتیجه را ببینید.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                label="آستانه شباهت پرسش‌وپاسخ"
                hint="بین ۰ و ۱ — پیش‌فرض ۰٫۴۵"
                inputMode="decimal"
                value={qaSim}
                onChange={(e) => setQaSim(e.target.value)}
              />
              <Input
                label="آستانه شباهت دانش"
                hint="بین ۰ و ۱ — پیش‌فرض ۰٫۲"
                inputMode="decimal"
                value={chunkSim}
                onChange={(e) => setChunkSim(e.target.value)}
              />
              <Input
                label="تعداد قطعه دانش"
                hint="بین ۱ و ۱۰"
                inputMode="numeric"
                value={chunkCount}
                onChange={(e) => setChunkCount(e.target.value)}
              />
              <Input
                label="تعداد پرسش‌وپاسخ"
                hint="بین ۱ و ۵"
                inputMode="numeric"
                value={qaCount}
                onChange={(e) => setQaCount(e.target.value)}
              />
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void save()} loading={saving}>
              ذخیره تنظیمات
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
