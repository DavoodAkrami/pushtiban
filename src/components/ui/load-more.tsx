"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// LoadMore — the foot of a long list.
//
// A list that just stops leaves the reader guessing whether they reached the
// end or the page gave up. This says how much of the list is on screen, how
// much there is, and exactly how many rows the next click adds.
// ---------------------------------------------------------------------------

export type LoadMoreProps = {
  /** Rows currently on screen. */
  shown: number;
  /** Rows there are in total, after any filter the list applies. */
  total: number;
  /** What is being counted, in Persian — «کسب‌وکار», «گفتگو». */
  unit: string;
  /**
   * Rows the next click adds, so the button can promise the exact number
   * instead of «نمایش بیشتر».
   */
  step?: number;
  loading?: boolean;
  /** Omit when nothing more can be fetched — only the summary is shown. */
  onLoadMore?: () => void;
  className?: string;
};

/**
 * LoadMore — count line, a hairline of progress through the list, and the
 * button that extends it. Renders nothing for an empty list; that is an
 * `EmptyState`, not a footer.
 */
export const LoadMore = ({
  shown,
  total,
  unit,
  step,
  loading = false,
  onLoadMore,
  className,
}: LoadMoreProps) => {
  const reduce = useReducedMotion();

  if (total <= 0) return null;

  const remaining = Math.max(total - shown, 0);
  const complete = remaining === 0;
  const nextBatch = step ? Math.min(step, remaining) : 0;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 pt-5 text-center",
        className
      )}
    >
      {/* Polite, not assertive: the count changing is confirmation the click
          worked, not something to interrupt for. */}
      <p aria-live="polite" className="text-xs text-muted">
        {complete
          ? `همهٔ ${fa(total)} ${unit} نمایش داده شد`
          : `${fa(shown)} از ${fa(total)} ${unit}`}
      </p>

      {!complete && (
        <div
          aria-hidden
          className="h-px w-full max-w-40 overflow-hidden rounded-full bg-line"
        >
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={false}
            animate={{ width: `${Math.min((shown / total) * 100, 100)}%` }}
            transition={{ duration: reduce ? 0 : 0.4, ease: luxe }}
          />
        </div>
      )}

      {!complete && onLoadMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={loading}
          onClick={onLoadMore}
          startIcon={<ChevronDown className="size-4" />}
        >
          {nextBatch > 0
            ? `نمایش ${fa(nextBatch)} ${unit} بعدی`
            : "نمایش بیشتر"}
        </Button>
      )}
    </div>
  );
};
