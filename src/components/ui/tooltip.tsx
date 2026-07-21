"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { luxe } from "@/components/motion/reveal";

type Side = "top" | "bottom" | "start" | "end";

export interface TooltipProps {
  /** Tooltip text. */
  content: React.ReactNode;
  /** Placement relative to the trigger. Default: top. */
  side?: Side;
  /** ms before showing on hover. Default: 300. */
  delay?: number;
  className?: string;
  /** Extra classes for the trigger wrapper span (e.g. `w-full` in menus). */
  wrapperClassName?: string;
  children: React.ReactElement;
}

/* Outer span handles placement (static transforms), inner motion element
   animates — keeps Framer's transform from clobbering the centering. */
const POSITION: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 pb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 pt-2",
  start: "end-full top-1/2 -translate-y-1/2 pe-2",
  end: "start-full top-1/2 -translate-y-1/2 ps-2",
};

const OFFSET: Record<Side, { x?: number; y?: number }> = {
  top: { y: 4 },
  bottom: { y: -4 },
  start: { x: -4 },
  end: { x: 4 },
};

/**
 * Tooltip — hover/focus hint. Wraps a single child; shows on hover and
 * keyboard focus, hides on Esc. Uses aria-describedby for screen readers.
 */
export function Tooltip({
  content,
  side = "top",
  delay = 300,
  className,
  wrapperClassName,
  children,
}: TooltipProps) {
  const id = React.useId();
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = React.useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  React.useEffect(() => () => clearTimeout(timer.current), []);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hide]);

  const child = React.cloneElement(children, {
    "aria-describedby": open ? id : undefined,
  });

  return (
    <span
      className={cn("relative inline-flex", wrapperClassName)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {child}
      <AnimatePresence>
        {open && (
          <span
            className={cn("pointer-events-none absolute z-[70]", POSITION[side])}
          >
            <motion.span
              id={id}
              role="tooltip"
              initial={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.94, ...OFFSET[side] }
              }
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: luxe }}
              className={cn(
                "block whitespace-nowrap rounded-xl border border-line bg-card px-3 py-1.5 text-xs text-foreground shadow-lift",
                className
              )}
            >
              {content}
            </motion.span>
          </span>
        )}
      </AnimatePresence>
    </span>
  );
}
