"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Routed sub-navigation for a dashboard section. These are real links, not ARIA
// tabs — there is no JS tabpanel, each tab is its own route — so the markup is
// <nav> + aria-current="page", matching the sidebar in components/dashboard/shell.
// ---------------------------------------------------------------------------

export type PageTabItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Small trailing slot, typically a count Badge. */
  badge?: React.ReactNode;
};

export type PageTabsProps = {
  items: PageTabItem[];
  /** Describes the group for screen readers, e.g. "بخش‌های دانش دستیار". */
  ariaLabel: string;
  className?: string;
};

/**
 * Picks the active tab by longest matching href. A section's first tab usually
 * sits on the parent path (/dashboard/knowledge) while its siblings nest under
 * it (/dashboard/knowledge/qa), so a plain prefix test would light up both —
 * the longest match is always the more specific one.
 */
const findActiveHref = (items: PageTabItem[], pathname: string): string | null => {
  let active: string | null = null;

  for (const item of items) {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!matches) continue;
    if (active === null || item.href.length > active.length) active = item.href;
  }

  return active;
};

export const PageTabs = ({ items, ariaLabel, className }: PageTabsProps) => {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const indicatorId = React.useId();
  const activeRef = React.useRef<HTMLAnchorElement>(null);

  const activeHref = findActiveHref(items, pathname);

  // Keep the active tab visible when the strip scrolls horizontally on narrow
  // viewports. "nearest" never scrolls the page itself, only the strip.
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeHref, reduce]);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("-mx-1 overflow-x-auto px-1 pb-1", className)}
    >
      <ul className="inline-flex min-w-full items-center gap-1 rounded-full border border-line bg-surface/60 p-1">
        {items.map((item) => {
          const active = item.href === activeHref;

          return (
            <li key={item.href} className="shrink-0">
              <Link
                ref={active ? activeRef : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`${indicatorId}-page-tab`}
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-card"
                    transition={
                      reduce ? { duration: 0 } : { duration: 0.3, ease: luxe }
                    }
                  />
                )}
                {item.icon && (
                  <item.icon className="relative size-4 shrink-0" aria-hidden />
                )}
                <span className="relative">{item.label}</span>
                {item.badge && <span className="relative">{item.badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
