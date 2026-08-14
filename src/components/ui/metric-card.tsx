"use client";

import * as React from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// MetricCard — one number the dashboard is accountable for.
//
// The overview and the admin console each kept their own copy of this card and
// the copies had already diverged (one could link, one could not). Beyond
// settling that, the card can now carry the two things a bare number cannot: a
// signed change against a previous period, and a sparkline of how it got here.
// ---------------------------------------------------------------------------

export type MetricTone = "accent" | "success" | "warning" | "danger";

/** Which direction is good news, so the change chip can be colored honestly. */
export type MetricDeltaSense = "up" | "down" | "none";

export type MetricDelta = {
  /** Percent change against the previous period; the sign picks the arrow. */
  value: number;
  /** What it is measured against — «نسبت به هفته گذشته». */
  since?: string;
  /**
   * `up` when a rise is good (answered messages), `down` when a fall is
   * (waiting customers), `none` when it is neither and the chip should stay
   * quiet — token spend rising is information, not a verdict. Default: `up`.
   */
  sense?: MetricDeltaSense;
};

export type MetricCardProps = {
  /** What is being counted. */
  label: string;
  /** The number itself, already formatted in Persian digits. */
  value: React.ReactNode;
  /** One line under the number — the denominator, the period, the limit. */
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: MetricTone;
  delta?: MetricDelta;
  /**
   * Recent values, oldest first, drawn as a sparkline under the number. It is
   * decorative: whatever it shows must also be said in `hint` or `delta`.
   */
  trend?: number[];
  loading?: boolean;
  /** Turns the whole card into a link to the page that owns the number. */
  href?: string;
  className?: string;
};

const TONE_COLOR: Record<MetricTone, string> = {
  accent: "rgb(var(--accent))",
  success: "rgb(var(--success))",
  warning: "rgb(var(--warning))",
  danger: "rgb(var(--danger))",
};

/**
 * A trend line with no axes, no grid and no tooltip — it reads as texture under
 * the number rather than a chart you interrogate. Recharts draws it so the
 * curve, the fill and the mount animation match the dashboard's real charts.
 */
const Sparkline = ({
  values,
  color,
  reduce,
}: {
  values: number[];
  color: string;
  reduce: boolean;
}) => {
  // The generated id lands in `url(#…)`, so the punctuation React wraps it in
  // (`«r0»`) is stripped — a fragment reference has to stay plain ASCII.
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `metric-spark-${uid}`;
  const data = values.map((value, index) => ({ index, value }));

  return (
    <div aria-hidden className="mt-4 h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={!reduce}
            animationDuration={520}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/** The signed change chip. Reads as one sentence to a screen reader. */
const DeltaChip = ({ delta }: { delta: MetricDelta }) => {
  const rounded = Math.round(delta.value);
  const rising = rounded > 0;
  const flat = rounded === 0;
  const sense = delta.sense ?? "up";
  const good = sense === "none" ? null : rising === (sense === "up");

  const label = flat
    ? "بدون تغییر"
    : `${fa(Math.abs(rounded))}٪ ${rising ? "بیشتر" : "کمتر"}${
        delta.since ? ` ${delta.since}` : ""
      }`;

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        flat || good === null
          ? "bg-line text-muted"
          : good
            ? "bg-success/15 text-success"
            : "bg-danger/15 text-danger"
      )}
    >
      {!flat &&
        // RTL: the arrow leans toward the start of the line, which is the right.
        (rising ? (
          <ArrowUpRight aria-hidden className="size-3" />
        ) : (
          <ArrowDownRight aria-hidden className="size-3" />
        ))}
      <span aria-hidden>{flat ? "۰٪" : `${fa(Math.abs(rounded))}٪`}</span>
    </span>
  );
};

/**
 * MetricCard — label, number, hint; optionally a change chip, a sparkline and a
 * link. Pass `loading` while the number is in flight rather than showing a zero
 * the owner would read as real.
 */
export const MetricCard = ({
  label,
  value,
  hint,
  icon,
  tone = "accent",
  delta,
  trend,
  loading = false,
  href,
  className,
}: MetricCardProps) => {
  const reduce = useReducedMotion();

  const body = (
    <>
      <div className="flex items-center gap-3">
        <Icon icon={icon} tile size="sm" tone={tone} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {label}
        </span>
        {!loading && delta && <DeltaChip delta={delta} />}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-3 text-2xl font-black tabular-nums">{value}</p>
      )}

      {hint && <p className="mt-1 text-xs leading-6 text-muted">{hint}</p>}

      {trend &&
        trend.length > 1 &&
        (loading ? (
          <Skeleton className="mt-4 h-10 w-full rounded-xl" />
        ) : (
          <Sparkline
            values={trend}
            color={TONE_COLOR[tone]}
            reduce={Boolean(reduce)}
          />
        ))}
    </>
  );

  const surface = "rounded-3xl border border-line bg-surface/40 p-5";

  if (!href) {
    return <div className={cn(surface, className)}>{body}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        surface,
        "block transition-colors duration-300 hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        className
      )}
    >
      {body}
    </Link>
  );
};
