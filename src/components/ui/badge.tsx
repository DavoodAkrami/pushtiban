import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-line bg-card/70 text-foreground",
        accent: "border-accent/25 bg-accent/12 text-accent",
        success: "border-success/25 bg-success/12 text-success",
        error: "border-danger/25 bg-danger/12 text-danger",
        warning: "border-warning/25 bg-warning/12 text-warning",
        // `line` already carries its own alpha (`rgb(var(--line) / var(--line-alpha))`),
        // so a `/60` modifier REPLACES that alpha instead of scaling it — which
        // painted this chip 60% black in light theme, under 65% black text. Plain
        // `bg-line` is the hairline fill the token is for.
        muted: "border-transparent bg-line text-muted",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Shows a small status dot before the label. */
  dot?: boolean;
}

export function Badge({ variant, dot, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      )}
      {children}
    </span>
  );
}
