"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const buttonVariants = cva(
  // before:hidden suppresses the glass top-sheen line on button surfaces
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors duration-300 ease-luxe before:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-foreground shadow-glow hover:brightness-110 hover:shadow-lift",
        secondary: "glass text-foreground hover:bg-card",
        outline:
          "border border-line bg-transparent text-foreground hover:bg-card/60",
        ghost: "text-muted hover:text-foreground hover:bg-line/50",
        danger:
          "bg-danger text-white hover:brightness-110 focus-visible:ring-danger/60",
        success:
          "bg-success text-white hover:brightness-110 focus-visible:ring-success/60",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline focus-visible:ring-offset-0",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-[3.25rem] px-8 text-base",
        icon: "size-11 px-0",
        "icon-sm": "size-9 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children">,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Icon placed before the label (start side in RTL). */
  startIcon?: React.ReactNode;
  /** Icon placed after the label. */
  endIcon?: React.ReactNode;
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      startIcon,
      endIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const reduce = useReducedMotion();
    const still = variant === "link" || !!reduce;
    return (
      <motion.button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        whileHover={still ? undefined : { y: -2 }}
        whileTap={still ? undefined : { y: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        {...props}
      >
        {loading ? <Spinner size="sm" /> : startIcon}
        {children}
        {!loading && endIcon}
      </motion.button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
