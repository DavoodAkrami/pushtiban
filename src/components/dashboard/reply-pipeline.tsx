"use client";

import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The route a customer message actually travels, in the order the Telegram
// webhook tries each stage: flows, then keyword automations, then the AI
// assistant, then a human. This model only existed in the webhook code, which
// is why nothing in the dashboard explained why these pages are separate.
// ---------------------------------------------------------------------------

export type PipelineStage = {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  /** Off stages render muted — they are skipped for every message. */
  active: boolean;
};

const Stage = ({ stage, loading }: { stage: PipelineStage; loading: boolean }) => (
  <Link
    href={stage.href}
    className={cn(
      "group flex min-w-0 flex-1 items-center gap-3 rounded-2xl border p-3 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      stage.active
        ? "border-line bg-background/40 hover:border-accent/30"
        : "border-dashed border-line bg-background/20 hover:border-line"
    )}
  >
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl",
        stage.active ? "bg-accent/12 text-accent" : "bg-card text-muted"
      )}
    >
      <stage.icon className="size-4" aria-hidden />
    </span>
    <span className="min-w-0">
      <span
        className={cn(
          "block truncate text-xs font-medium",
          stage.active ? "text-foreground" : "text-muted"
        )}
      >
        {stage.label}
      </span>
      {loading ? (
        <Skeleton className="mt-1.5 h-3 w-16" />
      ) : (
        <span className="mt-0.5 block truncate text-[11px] text-muted">
          {stage.hint}
        </span>
      )}
    </span>
  </Link>
);

export const ReplyPipeline = ({
  stages,
  loading,
}: {
  stages: PipelineStage[];
  loading: boolean;
}) => (
  <section
    aria-label="مسیر پاسخ به پیام مشتری"
    className="rounded-3xl border border-line bg-surface/40 p-5 sm:p-6"
  >
    <h2 className="text-sm font-bold">مسیر پاسخ</h2>
    <p className="mt-1 text-xs leading-6 text-muted">
      پیام مشتری از بالا وارد می‌شود و به اولین مرحله‌ای می‌رسد که بتواند
      پاسخش را بدهد؛ مرحله‌های خاموش نادیده گرفته می‌شوند.
    </p>

    <ol className="mt-5 flex flex-col gap-2 lg:flex-row lg:items-stretch">
      {stages.map((stage, index) => (
        <li key={stage.href} className="flex min-w-0 flex-1 items-center gap-2">
          <Stage stage={stage} loading={loading} />
          {index < stages.length - 1 && (
            <ChevronLeft
              className="hidden size-4 shrink-0 text-muted lg:block"
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
  </section>
);

/** Persian count hint for a stage, e.g. «۳ فعال» or «تعریف نشده». */
export const stageCountHint = (count: number, unit: string): string =>
  count > 0 ? `${fa(count)} ${unit}` : "تعریف نشده";
