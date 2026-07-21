"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { luxe } from "@/components/motion/reveal";

type AlertVariant = "default" | "info" | "success" | "error" | "warning";

const STYLES: Record<
  AlertVariant,
  { icon: React.ElementType; wrap: string; iconClass: string }
> = {
  default: {
    icon: Info,
    wrap: "border-line bg-surface/60",
    iconClass: "text-muted",
  },
  info: {
    icon: Info,
    wrap: "border-accent/25 bg-accent/10",
    iconClass: "text-accent",
  },
  success: {
    icon: CheckCircle2,
    wrap: "border-success/25 bg-success/10",
    iconClass: "text-success",
  },
  error: {
    icon: AlertCircle,
    wrap: "border-danger/25 bg-danger/10",
    iconClass: "text-danger",
  },
  warning: {
    icon: AlertTriangle,
    wrap: "border-warning/25 bg-warning/10",
    iconClass: "text-warning",
  },
};

export interface AlertProps {
  variant?: AlertVariant;
  title: string;
  description?: string;
  /** Renders a close button; called when pressed. */
  onDismiss?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function Alert({
  variant = "default",
  title,
  description,
  onDismiss,
  className,
  children,
}: AlertProps) {
  const { icon: Icon, wrap, iconClass } = STYLES[variant];
  const reduce = useReducedMotion();
  return (
    <motion.div
      role={variant === "error" ? "alert" : "status"}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: luxe }}
      className={cn(
        "flex gap-3 rounded-2xl border p-4",
        wrap,
        className
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconClass)} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold leading-6">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-6 text-muted">{description}</p>
        )}
        {children}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="بستن"
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-line/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </motion.div>
  );
}
