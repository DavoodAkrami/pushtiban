"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { cn } from "@/lib/utils";

/** Wraps children in gentle scroll parallax. speed > 0 moves slower than scroll. */
export function Parallax({
  children,
  className,
  distance = 60,
}: {
  children: React.ReactNode;
  className?: string;
  /** total px the element travels across its scroll window (negative = opposite) */
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return (
    <motion.div ref={ref} style={reduce ? undefined : { y }} className={className}>
      {children}
    </motion.div>
  );
}

/** Ambient background: radial glows + blurred drifting shapes. Purely decorative. */
export function AmbientBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      {/* top center glow */}
      <div className="absolute left-1/2 top-[-20%] h-[52rem] w-[52rem] -translate-x-1/2 rounded-full bg-accent/[0.10] blur-[140px] dark:bg-accent/[0.13]" />
      {/* side accents */}
      <div className="absolute right-[-14%] top-[28%] h-[30rem] w-[30rem] rounded-full bg-accent/[0.05] blur-[120px] animate-drift" />
      <div className="absolute left-[-12%] top-[56%] h-[26rem] w-[26rem] rounded-full bg-accent/[0.06] blur-[110px] animate-drift [animation-delay:-3.5s]" />
      {/* faint grid */}
      <div className="absolute inset-0 opacity-[0.35] dark:opacity-[0.22] bg-[image:linear-gradient(rgb(var(--line)/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--line)/0.05)_1px,transparent_1px)] bg-[length:72px_72px] [mask-image:radial-gradient(ellipse_90%_60%_at_50%_0%,black_30%,transparent_75%)] [-webkit-mask-image:radial-gradient(ellipse_90%_60%_at_50%_0%,black_30%,transparent_75%)]" />
    </div>
  );
}
