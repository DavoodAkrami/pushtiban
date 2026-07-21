"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      className,
      id: idProp,
      checked: checkedProp,
      defaultChecked,
      onChange,
      ...props
    },
    ref
  ) => {
    const autoId = React.useId();
    const id = idProp ?? autoId;
    const reduce = useReducedMotion();
    const [internal, setInternal] = React.useState(defaultChecked ?? false);
    const checked = checkedProp ?? internal;
    return (
      <label
        htmlFor={id}
        className={cn(
          "group flex cursor-pointer items-start gap-3",
          props.disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setInternal(e.target.checked);
              onChange?.(e);
            }}
            className="peer size-5 cursor-pointer appearance-none rounded-md border border-line bg-surface/60 transition-colors duration-200 ease-luxe checked:border-accent checked:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
            {...props}
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute text-white"
            initial={false}
            animate={
              checked
                ? { scale: 1, opacity: 1 }
                : { scale: reduce ? 1 : 0.4, opacity: 0 }
            }
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
        </span>
        {(label || description) && (
          <span className="text-sm leading-6">
            {label}
            {description && (
              <span className="block text-xs leading-5 text-muted">
                {description}
              </span>
            )}
          </span>
        )}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      className,
      id: idProp,
      checked: checkedProp,
      defaultChecked,
      onChange,
      ...props
    },
    ref
  ) => {
    const autoId = React.useId();
    const id = idProp ?? autoId;
    const reduce = useReducedMotion();
    const [internal, setInternal] = React.useState(defaultChecked ?? false);
    const checked = checkedProp ?? internal;
    return (
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-center gap-3",
          props.disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <span className="relative inline-flex h-6 w-11 shrink-0" dir="ltr">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            role="switch"
            checked={checked}
            onChange={(e) => {
              setInternal(e.target.checked);
              onChange?.(e);
            }}
            className="peer size-full cursor-pointer appearance-none rounded-full bg-line/80 transition-colors duration-300 ease-luxe checked:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
            {...props}
          />
          {/* knob starts left, slides right when on */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-soft"
            initial={false}
            animate={{ x: checked ? 20 : 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 500, damping: 32 }
            }
          />
        </span>
        {label && <span className="text-sm">{label}</span>}
      </label>
    );
  }
);
Switch.displayName = "Switch";
