import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Icon — the single way icons are rendered across the product.
 * Wraps any Lucide icon with the design system's sizes and tones,
 * plus an optional soft "tile" container (the rounded square used
 * across the landing page).
 */
const iconVariants = cva("shrink-0", {
  variants: {
    size: {
      xs: "size-3.5",
      sm: "size-4",
      md: "size-5",
      lg: "size-6",
      xl: "size-8",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted",
      accent: "text-accent",
      success: "text-success",
      danger: "text-danger",
      warning: "text-warning",
    },
  },
  defaultVariants: { size: "md", tone: "default" },
});

const tileVariants = cva(
  "inline-flex items-center justify-center rounded-2xl",
  {
    variants: {
      tone: {
        default: "bg-card/70 text-foreground",
        muted: "bg-line/60 text-muted",
        accent: "bg-accent/15 text-accent",
        success: "bg-success/15 text-success",
        danger: "bg-danger/15 text-danger",
        warning: "bg-warning/15 text-warning",
      },
      size: {
        xs: "size-7 rounded-lg",
        sm: "size-9 rounded-xl",
        md: "size-12",
        lg: "size-14",
        xl: "size-16 rounded-3xl",
      },
    },
    defaultVariants: { size: "md", tone: "accent" },
  }
);

/**
 * Any icon component that renders an SVG from these props — Lucide and
 * react-icons both fit. Lucide covers almost everything, but brand marks left
 * the library at v1, so channels like Instagram come from react-icons/tb.
 */
export type AppIcon = React.ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
  role?: string;
}>;

export interface IconProps extends VariantProps<typeof iconVariants> {
  icon: AppIcon;
  /** Wraps the icon in a soft rounded tile. */
  tile?: boolean;
  /** Accessible name; omit for decorative icons (default aria-hidden). */
  label?: string;
  className?: string;
}

export function Icon({ icon: Lucide, size, tone, tile, label, className }: IconProps) {
  const glyph = (
    <Lucide
      className={cn(iconVariants({ size, tone: tile ? undefined : tone }), tile && "text-current")}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
  if (!tile) return glyph;
  return (
    <span className={cn(tileVariants({ size, tone }), className)}>{glyph}</span>
  );
}
