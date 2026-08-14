"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChartArea, ChartColumn, type LucideIcon } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Tooltip } from "@/components/ui/tooltip";
import type { ChartProps } from "@/components/ui/chart";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared pieces for every usage chart in the dashboard — the admin console
// (platform + one business) and the business overview all read the same
// /api/usage/series endpoint and render the same range switcher.
// ---------------------------------------------------------------------------

export type UsageRange = "week" | "month" | "year";

export type UsagePoint = {
  bucket: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  messages: number;
};

export type UsageSeries = {
  range: UsageRange;
  points: UsagePoint[];
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    messages: number;
  };
};

const EMPTY_TOTALS = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  messages: 0,
};

export const RANGE_OPTIONS: Array<{ value: UsageRange; label: string }> = [
  { value: "week", label: "هفته" },
  { value: "month", label: "ماه" },
  { value: "year", label: "سال" },
];

/** What the selected range covers, for the chart's caption. */
export const RANGE_HINTS: Record<UsageRange, string> = {
  week: "۷ روز گذشته، روزانه",
  month: "۳۰ روز گذشته، روزانه",
  year: "۱۲ ماه گذشته، ماهانه",
};

/** Compact Persian token display: ۱٬۲۳۴ / ۱۲٫۳ هزار / ۴٫۵ میلیون. */
export const faTokens = (value: number): string => {
  if (value >= 1_000_000) return `${fa((value / 1_000_000).toFixed(1))} میلیون`;
  if (value >= 10_000) return `${fa((value / 1_000).toFixed(1))} هزار`;
  return fa(value.toLocaleString("en-US").replace(/,/g, "٬"));
};

/** Persian thousands separator without the compact suffixes. */
export const faNumber = (value: number): string =>
  fa(value.toLocaleString("en-US").replace(/,/g, "٬"));

// ---------------------------------------------------------------------------
// Segmented controls — a pill radiogroup with a sliding indicator, shared by
// the range switcher and the chart-type switcher above every usage chart.
// ---------------------------------------------------------------------------

type Segment<T extends string> = {
  value: T;
  /** Visible text; omit for icon-only segments. */
  label?: string;
  icon?: LucideIcon;
  /** Accessible name, and the tooltip text when there is no visible label. */
  name?: string;
};

const SegmentedTabs = <T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  className,
}: {
  options: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Describes the group for screen readers. */
  label: string;
  disabled?: boolean;
  className?: string;
}) => {
  const reduce = useReducedMotion();
  const groupId = React.useId();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface/60 p-1",
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const segment = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label ? undefined : option.name}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-8 items-center justify-center rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50",
              option.label ? "min-w-16 px-3 text-xs" : "w-9",
              selected
                ? "font-medium text-foreground"
                : "text-muted hover:text-foreground"
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${groupId}-segment`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-card"
                transition={reduce ? { duration: 0 } : { duration: 0.3, ease: luxe }}
              />
            )}
            {option.icon && (
              <option.icon className="relative size-4" aria-hidden />
            )}
            {option.label && <span className="relative">{option.label}</span>}
          </button>
        );

        // Icon-only segments name themselves with a tooltip; labelled ones read
        // for themselves and would only repeat the label on hover.
        if (option.label || !option.name) return segment;
        return (
          <Tooltip key={option.value} content={option.name} side="bottom">
            {segment}
          </Tooltip>
        );
      })}
    </div>
  );
};

/** Week / month / year switcher for a usage chart. */
export const UsageRangeTabs = ({
  value,
  onChange,
  label = "بازه زمانی نمودار",
  disabled = false,
  className,
}: {
  value: UsageRange;
  onChange: (range: UsageRange) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <SegmentedTabs
    options={RANGE_OPTIONS}
    value={value}
    onChange={onChange}
    label={label}
    disabled={disabled}
    className={className}
  />
);

/** The two shapes a usage chart can take — matches `Chart`'s own variants. */
export type ChartType = NonNullable<ChartProps["variant"]>;

const CHART_TYPE_OPTIONS: Array<Segment<ChartType>> = [
  { value: "area", icon: ChartArea, name: "نمودار سطحی" },
  { value: "bar", icon: ChartColumn, name: "نمودار ستونی" },
];

/** Area / column switcher for a usage chart. */
export const ChartTypeTabs = ({
  value,
  onChange,
  label = "نوع نمودار",
  disabled = false,
  className,
}: {
  value: ChartType;
  onChange: (type: ChartType) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <SegmentedTabs
    options={CHART_TYPE_OPTIONS}
    value={value}
    onChange={onChange}
    label={label}
    disabled={disabled}
    className={className}
  />
);

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

type SeriesScope =
  | { scope: "self" }
  | { scope: "platform" }
  | { scope: "business"; userId: string };

/**
 * Load a bucketed usage series for the given range. `enabled` lets a caller
 * (e.g. a modal) hold the request until it is actually visible. Failures leave
 * an all-zero series in place rather than an error state — the surrounding
 * panel already reports load failures.
 */
export const useUsageSeries = (
  target: SeriesScope,
  range: UsageRange,
  enabled = true
) => {
  const [series, setSeries] = React.useState<UsageSeries | null>(null);
  const [loading, setLoading] = React.useState(enabled);

  const userId = target.scope === "business" ? target.userId : null;
  const scope = target.scope;

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);

    const params = new URLSearchParams({ range, scope });
    if (userId) params.set("userId", userId);

    fetch(`/api/usage/series?${params.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<UsageSeries>) : null))
      .then((data) => {
        if (!active) return;
        setSeries(data);
      })
      .catch(() => {
        if (active) setSeries(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, range, scope, userId]);

  return {
    series,
    loading,
    totals: series?.totals ?? EMPTY_TOTALS,
    points: series?.points ?? [],
  };
};

/** Recharts rows for the input/output token chart. */
export const toTokenChartData = (points: UsagePoint[]) =>
  points.map((point) => ({
    label: point.label,
    input: point.promptTokens,
    output: point.completionTokens,
  }));

export const TOKEN_CHART_SERIES = [
  { key: "input", label: "توکن ورودی" },
  { key: "output", label: "توکن خروجی" },
];

// ---------------------------------------------------------------------------
// Small presentational helpers reused by the admin console and the overview.
// ---------------------------------------------------------------------------

/** A label/value pair used under a chart to summarise the visible range. */
export const UsageFigure = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "success";
}) => (
  <div className="min-w-0">
    <dt className="flex items-center gap-1.5 text-xs text-muted">
      {tone !== "default" && (
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            tone === "accent" ? "bg-accent" : "bg-success"
          )}
        />
      )}
      {label}
    </dt>
    <dd className="mt-1 truncate text-sm font-bold tabular-nums">{value}</dd>
  </div>
);
