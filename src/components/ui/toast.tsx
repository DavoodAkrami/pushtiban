"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { luxe } from "@/components/motion/reveal";

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms until auto-dismiss; 0 disables. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "variant">> {
  id: number;
  description?: string;
  duration: number;
  action?: ToastOptions["action"];
}

const ToastContext = React.createContext<{
  toast: (options: ToastOptions) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast باید داخل ToastProvider استفاده شود");
  return ctx;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: React.ElementType; iconClass: string; barClass: string }
> = {
  default: { icon: Info, iconClass: "text-muted", barClass: "bg-line" },
  info: { icon: Info, iconClass: "text-accent", barClass: "bg-accent" },
  success: {
    icon: CheckCircle2,
    iconClass: "text-success",
    barClass: "bg-success",
  },
  error: { icon: AlertCircle, iconClass: "text-danger", barClass: "bg-danger" },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning",
    barClass: "bg-warning",
  },
};

function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const reduce = useReducedMotion();
  const { icon: Icon, iconClass, barClass } = VARIANT_STYLES[item.variant];

  React.useEffect(() => {
    if (!item.duration) return;
    const t = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item, onDismiss]);

  return (
    <motion.div
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.96 }
      }
      transition={{ duration: 0.35, ease: luxe }}
      role={item.variant === "error" ? "alert" : "status"}
      className="glass-strong pointer-events-auto relative w-80 overflow-hidden rounded-2xl p-4 shadow-lift"
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 start-0 w-1", barClass)}
      />
      <div className="flex gap-3 ps-1.5">
        <Icon className={cn("mt-0.5 size-5 shrink-0", iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-6">{item.title}</p>
          {item.description && (
            <p className="mt-0.5 text-xs leading-6 text-muted">
              {item.description}
            </p>
          )}
          {item.action && (
            <button
              onClick={() => {
                item.action?.onClick();
                onDismiss(item.id);
              }}
              className="mt-2 text-xs font-bold text-accent transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-md"
            >
              {item.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onDismiss(item.id)}
          aria-label="بستن اعلان"
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-line/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((prev) => [
      // newest on top; keep at most 4 on screen
      {
        id,
        title: options.title,
        description: options.description,
        variant: options.variant ?? "default",
        duration: options.duration ?? 5000,
        action: options.action,
      },
      ...prev.slice(0, 3),
    ]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-label="اعلان‌ها"
        className="pointer-events-none fixed right-5 top-5 z-[60] flex flex-col gap-3"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((item) => (
            <Toast key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
