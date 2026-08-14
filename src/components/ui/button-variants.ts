import { cva, type VariantProps } from "class-variance-authority";

// ---------------------------------------------------------------------------
// The button's class recipe, deliberately OUTSIDE button.tsx.
//
// button.tsx is `"use client"` (it animates), and a `"use client"` module's
// exports become client references — calling one from a server component throws
// «Attempted to call buttonVariants() from the server». Server components style
// their own `<Link>`s with these classes all over the dashboard, so the recipe
// lives in a boundary-free module and button.tsx re-exports it for convenience.
// ---------------------------------------------------------------------------

export const buttonVariants = cva(
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

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
