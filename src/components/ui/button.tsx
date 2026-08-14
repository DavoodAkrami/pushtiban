"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import {
  buttonVariants,
  type ButtonVariantProps,
} from "@/components/ui/button-variants";

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children">,
    ButtonVariantProps {
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

// `buttonVariants` is intentionally NOT re-exported here: re-exporting it from
// this `"use client"` module would turn it back into a client reference and
// break every server component that styles a `<Link>` with it. Import it from
// `@/components/ui/button-variants`.
export { Button };
