"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Glass card with soft lift on hover and a cursor-following sheen.
 */
export function GlassCard({
  children,
  className,
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={interactive ? onMouseMove : undefined}
      whileHover={
        interactive && !reduce ? { y: -6, transition: { duration: 0.4 } } : undefined
      }
      className={cn(
        "glass group relative overflow-hidden rounded-3xl transition-shadow duration-500 ease-luxe",
        interactive && "hover:shadow-lift",
        className
      )}
    >
      {interactive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-[radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),rgb(var(--accent)/0.08),transparent_65%)]"
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}
