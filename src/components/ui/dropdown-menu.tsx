"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// DropdownMenu — Radix's menu (arrow keys, typeahead, Esc, outside click, RTL)
// animated with Framer Motion.
//
// The account menu inlined all of this, and it opened without ever closing:
// `AnimatePresence` was holding the exit animation while Radix's own presence
// unmounted the content on the same tick, so the menu blinked out instead. The
// fix is `forceMount`, which hands the unmount decision to AnimatePresence —
// the arrangement `modal.tsx` already uses, and the reason the open state has
// to live on the root where both can read it.
// ---------------------------------------------------------------------------

const DropdownMenuContext = React.createContext<{ open: boolean }>({
  open: false,
});

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** Defaults to RTL — every menu in this product opens in a Persian page. */
const DropdownMenu = ({
  children,
  open: openProp,
  defaultOpen,
  onOpenChange,
  dir = "rtl",
  ...props
}: DropdownMenuPrimitive.DropdownMenuProps) => {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const open = openProp ?? uncontrolled;

  return (
    <DropdownMenuPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        setUncontrolled(value);
        onOpenChange?.(value);
      }}
      dir={dir}
      {...props}
    >
      <DropdownMenuContext.Provider value={{ open }}>
        {children}
      </DropdownMenuContext.Provider>
    </DropdownMenuPrimitive.Root>
  );
};

/**
 * One row: 40px tall, highlighted by keyboard and pointer alike.
 *
 * The highlight is `bg-line` — the one surface token that reads as a change on
 * both themes. `bg-card` would be white on a white glass panel in the light
 * theme, which is how the account menu used to lose its highlight entirely.
 */
const itemClass =
  "flex h-10 cursor-pointer select-none items-center gap-3 rounded-2xl px-3 text-sm text-muted outline-none transition-colors data-[highlighted]:bg-line data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(
  (
    { className, children, align = "end", sideOffset = 10, ...props },
    ref
  ) => {
    const { open } = React.useContext(DropdownMenuContext);
    const reduce = useReducedMotion();

    return (
      <AnimatePresence>
        {open && (
          <DropdownMenuPrimitive.Portal forceMount>
            <DropdownMenuPrimitive.Content
              asChild
              forceMount
              ref={ref}
              align={align}
              sideOffset={sideOffset}
              collisionPadding={12}
              className="z-50"
              {...props}
            >
              <motion.div
                initial={
                  reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }
                }
                transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
                // Still on screen while it fades out, so it stops taking
                // clicks the moment it starts leaving.
                className={cn(
                  "glass-strong min-w-56 rounded-3xl p-2 shadow-lift outline-none data-[state=closed]:pointer-events-none",
                  className
                )}
              >
                {children}
              </motion.div>
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        )}
      </AnimatePresence>
    );
  }
);
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    /** `danger` for a row that destroys something. */
    tone?: "default" | "danger";
  }
>(({ className, tone = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      itemClass,
      tone === "danger" &&
        "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

/**
 * A radio row. The tick is placed for you at the end of the row, so a caller
 * only writes the icon and the label.
 */
const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(itemClass, className)}
    {...props}
  >
    <span className="flex min-w-0 flex-1 items-center gap-3">{children}</span>
    <DropdownMenuPrimitive.ItemIndicator>
      <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
    </DropdownMenuPrimitive.ItemIndicator>
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

/**
 * A heading inside the menu. `muted` is the small caps-ish label that names a
 * group of rows; the default carries the account name at the top.
 */
const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    variant?: "default" | "muted";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      variant === "muted"
        ? "flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-medium text-muted/80"
        : "px-3 py-2",
      className
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("my-1.5 h-px bg-line", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
};
