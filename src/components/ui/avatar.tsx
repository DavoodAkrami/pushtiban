import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Avatar — the initial standing in for a person or a business.
//
// Nobody uploads a picture to پشتیبان, so an avatar here is one letter on a
// soft fill. Three places drew it by hand with three sets of classes; the sizes
// and tones line up with `Icon`'s tiles so an avatar and an icon can sit in the
// same row without one looking a pixel off.
// ---------------------------------------------------------------------------

const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center font-bold leading-none",
  {
    variants: {
      size: {
        xs: "size-7 text-[11px]",
        sm: "size-9 text-sm",
        md: "size-11 text-base",
        lg: "size-14 text-lg",
      },
      tone: {
        default: "bg-card/70 text-foreground",
        // Plain `bg-line`: the token bakes its own alpha in, so a `/60`
        // modifier replaces it and the fill turns near-black in light theme.
        muted: "bg-line text-muted",
        accent: "bg-accent/15 text-accent",
        success: "bg-success/15 text-success",
      },
      /** `circle` for accounts, `tile` for rows in a list. */
      shape: {
        circle: "rounded-full",
        tile: "rounded-xl",
      },
    },
    defaultVariants: { size: "sm", tone: "accent", shape: "circle" },
  }
);

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  /** Name the initial is taken from. */
  name: string;
  /**
   * Accessible name. Omit when the name is already next to the avatar or on the
   * button around it — a lone letter read aloud tells nobody anything.
   */
  label?: string;
  className?: string;
}

/** First character of a name, safe for surrogate pairs and stray whitespace. */
const initialOf = (name: string) => Array.from(name.trim())[0] ?? "؟";

/** Avatar — one letter on a soft fill, sized and toned like `Icon`'s tiles. */
export const Avatar = ({
  name,
  label,
  size,
  tone,
  shape,
  className,
}: AvatarProps) => (
  <span
    className={cn(avatarVariants({ size, tone, shape }), className)}
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    {initialOf(name)}
  </span>
);
