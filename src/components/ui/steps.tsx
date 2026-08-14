"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { cn, fa } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Steps — where you are in something that has an order.
//
// Onboarding and the setup checklist each grew their own rail, and only one of
// them told a screen reader which step was current. The rail runs right to left
// (or top to bottom) and the connector between two markers fills in once the
// earlier step is done, so progress is legible without reading a single label.
// ---------------------------------------------------------------------------

export type Step = {
  /** Stable key, and what `onSelect` hands back. */
  id: string;
  label: string;
  /** One extra line, vertical orientation only. */
  description?: string;
};

export type StepsProps = {
  steps: Step[];
  /** Index being worked on now; everything before it reads as done. */
  current: number;
  orientation?: "vertical" | "horizontal";
  /**
   * Lets the reader go back to a step they have already passed. Steps ahead of
   * `current` stay inert — a flow cannot honour a click on a step whose inputs
   * do not exist yet.
   */
  onSelect?: (step: Step, index: number) => void;
  /** Every step done, including the current one — the flow finished. */
  complete?: boolean;
  /** Names the rail for screen readers. */
  label: string;
  className?: string;
};

type State = "done" | "current" | "upcoming";

const STATE_TEXT: Record<State, string> = {
  done: "انجام شد",
  current: "مرحلهٔ کنونی",
  upcoming: "باقی‌مانده",
};

const MARKER: Record<State, string> = {
  done: "border-success/30 bg-success/10 text-success",
  current: "border-accent bg-accent text-accent-foreground",
  upcoming: "border-line bg-surface text-muted",
};

/** The numbered circle, or a tick once the step is behind you. */
const Marker = ({
  state,
  index,
  reduce,
}: {
  state: State;
  index: number;
  reduce: boolean;
}) => (
  <span
    className={cn(
      "relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums transition-colors duration-300",
      MARKER[state]
    )}
  >
    <AnimatePresence initial={false} mode="wait">
      {state === "done" ? (
        <motion.span
          key="done"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
          className="flex"
        >
          <Check className="size-3" aria-hidden />
        </motion.span>
      ) : (
        <motion.span
          key="number"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
        >
          {fa(index + 1)}
        </motion.span>
      )}
    </AnimatePresence>
  </span>
);

/**
 * The line between two markers. It fills once the earlier step is done — the
 * fill grows from the top downward, and in the horizontal rail from the right,
 * because in RTL that is where the rail starts.
 */
const Connector = ({
  done,
  vertical,
  reduce,
}: {
  done: boolean;
  vertical: boolean;
  reduce: boolean;
}) => (
  <span
    aria-hidden
    className={cn(
      "relative overflow-hidden bg-line",
      vertical ? "my-1 w-px flex-1" : "mx-1 h-px min-w-4 flex-1"
    )}
  >
    <motion.span
      className={cn(
        "absolute inset-0 bg-success/50",
        vertical ? "origin-top" : "origin-right"
      )}
      initial={false}
      animate={vertical ? { scaleY: done ? 1 : 0 } : { scaleX: done ? 1 : 0 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: luxe }}
    />
  </span>
);

/**
 * Steps — a progress rail. `current` is the only state it needs; done and
 * upcoming are derived from it, so a flow keeps one number and not three lists.
 */
export const Steps = ({
  steps,
  current,
  orientation = "vertical",
  onSelect,
  complete = false,
  label,
  className,
}: StepsProps) => {
  const reduce = Boolean(useReducedMotion());
  const vertical = orientation === "vertical";

  const stateOf = (index: number): State => {
    if (complete || index < current) return "done";
    return index === current ? "current" : "upcoming";
  };

  return (
    <ol
      aria-label={label}
      className={cn(
        vertical ? "flex flex-col" : "flex items-center overflow-x-auto",
        className
      )}
    >
      {steps.map((step, index) => {
        const state = stateOf(index);
        const last = index === steps.length - 1;
        // A step you have not reached has nothing to show yet, so it stays
        // inert even when the rail is interactive.
        const reachable = Boolean(onSelect) && index <= current;

        const content = (
          <>
            <span
              className={cn(
                "block truncate text-xs transition-colors duration-300",
                state === "current"
                  ? "font-bold text-accent"
                  : state === "done"
                    ? "text-foreground"
                    : "text-muted"
              )}
            >
              {step.label}
            </span>
            {vertical && step.description && (
              <span className="mt-1 block text-[11px] leading-6 text-muted">
                {step.description}
              </span>
            )}
            <span className="sr-only">— {STATE_TEXT[state]}</span>
          </>
        );

        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              vertical ? "flex gap-3" : "flex shrink-0 items-center gap-2",
              !vertical && !last && "flex-1"
            )}
          >
            {vertical ? (
              <span className="flex flex-col items-center self-stretch">
                <Marker state={state} index={index} reduce={reduce} />
                {!last && (
                  <Connector done={state === "done"} vertical reduce={reduce} />
                )}
              </span>
            ) : (
              <Marker state={state} index={index} reduce={reduce} />
            )}

            {reachable ? (
              <button
                type="button"
                onClick={() => onSelect?.(step, index)}
                className={cn(
                  "min-w-0 rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  vertical ? cn("flex-1", !last && "pb-6") : "px-1 py-1"
                )}
              >
                {content}
              </button>
            ) : (
              <span
                className={cn(
                  "min-w-0",
                  vertical ? cn("flex-1", !last && "pb-6") : "px-1"
                )}
              >
                {content}
              </span>
            )}

            {!vertical && !last && (
              <Connector
                done={state === "done"}
                vertical={false}
                reduce={reduce}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};
