"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Chart — a token-styled recharts wrapper for the dashboard.
//
// The plot area is deliberately `dir="ltr"`: time reads left → right in a chart
// even inside an RTL page, which is the convention Persian dashboards follow.
// Labels and numbers stay Persian.
// ---------------------------------------------------------------------------

export type ChartSeries = {
  /** Key of the numeric value in each data row. */
  key: string;
  /** Persian label shown in the legend and tooltip. */
  label: string;
  /** Any CSS color — defaults walk the accent → success → warning tokens. */
  color?: string;
};

export type ChartProps = {
  data: Array<Record<string, string | number>>;
  series: ChartSeries[];
  /** Key of the category label in each data row (usually a date). */
  xKey: string;
  variant?: "area" | "bar";
  /** Stack the series on top of each other instead of overlaying them. */
  stacked?: boolean;
  height?: number;
  /** Formats values in the axis and tooltip. Defaults to Persian digits. */
  formatValue?: (value: number) => string;
  /** Shown instead of the plot when there is no data at all. */
  emptyText?: string;
  /** Describes the chart for screen readers — required. */
  ariaLabel: string;
  loading?: boolean;
  className?: string;
};

const DEFAULT_COLORS = [
  "rgb(var(--accent))",
  "rgb(var(--success))",
  "rgb(var(--warning))",
  "rgb(var(--danger))",
];

const axisStyle = {
  fontSize: 11,
  fill: "rgb(var(--muted-fg) / 0.65)",
} as const;

const ChartTooltip = ({
  active,
  payload,
  label,
  series,
  formatValue,
}: TooltipContentProps & {
  series: ChartSeries[];
  formatValue: (value: number) => string;
}) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      dir="rtl"
      className="min-w-36 rounded-2xl border border-line bg-card px-3.5 py-3 shadow-lift"
    >
      <p className="text-xs font-bold">{label}</p>
      <ul className="mt-2 space-y-1.5">
        {payload.map((entry) => {
          const meta = series.find((item) => item.key === entry.dataKey);
          return (
            <li
              key={String(entry.dataKey)}
              className="flex items-center gap-2 text-xs"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              <span className="text-muted">{meta?.label ?? entry.name}</span>
              <span className="ms-auto font-medium tabular-nums">
                {formatValue(Number(entry.value ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const Chart = ({
  data,
  series,
  xKey,
  variant = "area",
  stacked = false,
  height = 260,
  formatValue = (value) => fa(value.toLocaleString("en-US").replace(/,/g, "٬")),
  emptyText = "داده‌ای برای نمایش نیست.",
  ariaLabel,
  loading = false,
  className,
}: ChartProps) => {
  const reduce = useReducedMotion();

  const colored = series.map((item, index) => ({
    ...item,
    color: item.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));

  if (loading) {
    return (
      <div
        role="status"
        aria-label="در حال بارگذاری نمودار"
        style={{ height }}
        className={cn(
          "animate-pulse rounded-2xl border border-line bg-surface/40",
          className
        )}
      />
    );
  }

  if (!data.length) {
    return (
      <div
        style={{ height }}
        className={cn(
          "flex items-center justify-center rounded-2xl border border-dashed border-line bg-surface/25 px-6 text-center text-sm leading-7 text-muted",
          className
        )}
      >
        {emptyText}
      </div>
    );
  }

  const gridProps = {
    vertical: false,
    stroke: "rgb(var(--line) / var(--line-alpha))",
  };
  const tooltipContent = (props: TooltipContentProps) => (
    <ChartTooltip {...props} series={colored} formatValue={formatValue} />
  );
  const commonAxes = (
    <>
      <CartesianGrid {...gridProps} />
      <XAxis
        dataKey={xKey}
        tickLine={false}
        axisLine={false}
        tick={axisStyle}
        interval="preserveStartEnd"
        minTickGap={12}
      />
      <YAxis
        width={44}
        tickLine={false}
        axisLine={false}
        tick={axisStyle}
        tickFormatter={(value: number) => formatValue(value)}
      />
      <Tooltip
        content={tooltipContent}
        cursor={{ fill: "rgb(var(--line) / 0.14)" }}
      />
    </>
  );

  return (
    <figure className={cn("m-0", className)}>
      <div dir="ltr" role="img" aria-label={ariaLabel} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {variant === "bar" ? (
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              {commonAxes}
              {colored.map((item) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.label}
                  stackId={stacked ? "stack" : undefined}
                  fill={item.color}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={38}
                  isAnimationActive={!reduce}
                  animationDuration={520}
                />
              ))}
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                {colored.map((item) => (
                  <linearGradient
                    key={item.key}
                    id={`chart-fill-${item.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={item.color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              {commonAxes}
              {colored.map((item) => (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stackId={stacked ? "stack" : undefined}
                  stroke={item.color}
                  strokeWidth={2}
                  fill={`url(#chart-fill-${item.key})`}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={!reduce}
                  animationDuration={520}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {colored.length > 1 && (
        <figcaption className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {colored.map((item) => (
            <span
              key={item.key}
              className="flex items-center gap-2 text-xs text-muted"
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: item.color }}
              />
              {item.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
};
