"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { luxe } from "@/components/motion/reveal";
import { Icon, type AppIcon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// EmptyState — the dashed panel a list shows before it holds anything.
//
// Ten panels had written this by hand and they had drifted apart: some named
// the missing thing and offered the button that creates it, some only reported
// that there was nothing. The shape is settled here, so "what do I do now"
// always sits in the same place on the page.
// ---------------------------------------------------------------------------

const SIZES = {
  /** Nested inside a card or a column — the panel is already the context. */
  sm: {
    box: "rounded-2xl px-5 py-10",
    tile: "md",
    title: "text-base",
    lead: "mt-4",
  },
  /** A whole page's worth of nothing. */
  md: {
    box: "rounded-3xl px-6 py-14",
    tile: "lg",
    title: "text-lg",
    lead: "mt-5",
  },
} as const;

export type EmptyStateProps = {
  /** Glyph in the tile above the copy. */
  icon: AppIcon;
  /**
   * `accent` invites the owner to create the first one; `muted` reports a
   * result they cannot act on — a search that matched nothing, a list that is
   * someone else's to fill.
   */
  tone?: "accent" | "muted";
  /** Headline. Omit when the description alone is the whole message. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** The one thing to do next — usually a single Button. */
  action?: React.ReactNode;
  size?: keyof typeof SIZES;
  /** Heading level, so the state does not break the page's outline. */
  titleAs?: "h2" | "h3" | "p";
  className?: string;
};

/**
 * EmptyState — dashed surface, tile, headline, one action. Fades in on mount
 * because it usually replaces a skeleton, and a hard swap reads as a glitch.
 */
export const EmptyState = ({
  icon,
  tone = "accent",
  title,
  description,
  action,
  size = "md",
  titleAs: Title = "h2",
  className,
}: EmptyStateProps) => {
  const reduce = useReducedMotion();
  const style = SIZES[size];

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.35, ease: luxe }}
      className={cn(
        "border border-dashed border-line bg-surface/25 text-center",
        style.box,
        className
      )}
    >
      <Icon icon={icon} tile size={style.tile} tone={tone} />

      {title && (
        <Title className={cn("font-bold", style.lead, style.title)}>
          {title}
        </Title>
      )}

      {description && (
        <p
          className={cn(
            "mx-auto max-w-lg text-sm leading-7 text-muted",
            title ? "mt-2" : style.lead
          )}
        >
          {description}
        </p>
      )}

      {action && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action}
        </div>
      )}
    </motion.div>
  );
};
