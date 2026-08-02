"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  TbLayoutSidebarRightCollapse,
  TbLayoutSidebarRightExpand,
} from "react-icons/tb";
import {
  Check,
  ChevronLeft,
  Inbox,
  LogOut,
  Menu,
  Palette,
  Search,
  Settings2,
} from "lucide-react";
import {
  CommandPalette,
  type CommandGroup,
} from "@/components/ui/command-palette";
import { Tooltip } from "@/components/ui/tooltip";
import { luxe } from "@/components/motion/reveal";
import { cn, fa } from "@/lib/utils";
import {
  DASHBOARD_ROUTES,
  type DashboardRoute,
  type RouteSection,
} from "@/lib/dashboard/navigation";
import { THEME_OPTIONS } from "@/lib/dashboard/theme";
import type { SettingsSection } from "@/lib/settings-events";
import type { SessionProfile } from "@/store/slices/session-slice";
import { useInboxCount } from "@/store/use-inbox-count";

// ---------------------------------------------------------------------------
// The dashboard's top bar. It earns its 56px by owning three things no page
// can: where you are (breadcrumb + the title, once the page's own heading has
// scrolled away), how to get anywhere else (⌘K), and whether a customer is
// waiting. The account menu here is a second entry point to the sidebar's — the
// handlers are the shell's, so there is one implementation behind both.
// ---------------------------------------------------------------------------

/** Badges stop counting at this point — past it the number stops being news. */
const MAX_BADGE_COUNT = 99;

/**
 * Below this width the section link has no room, which would leave the bar with
 * no label at all — so the title stops waiting for the scroll and stays put.
 */
const COMPACT_QUERY = "(max-width: 639px)";

/**
 * How long the open-conversation count is trusted before the bar re-counts it.
 * Navigating between two knowledge tabs is not news about the inbox.
 */
const INBOX_COUNT_TTL = 60_000;

export type DashboardTopBarProps = {
  businessName: string;
  isAdmin: boolean;
  profile: SessionProfile | null | undefined;
  section: RouteSection | null;
  /** Page title for the current route, already resolved by the shell. */
  title: string | null;
  /** True once the page's own heading has slid under the bar. */
  titleRevealed: boolean;
  /** True once anything at all has scrolled under the bar. */
  scrolled: boolean;
  sidebarOpen: boolean;
  themeReady: boolean;
  onToggleSidebar: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onRequestSignOut: () => void;
  /** Focus target when the mobile drawer closes on a desktop-width viewport. */
  sidebarToggleRef: React.Ref<HTMLButtonElement>;
  mobileMenuTriggerRef: React.Ref<HTMLButtonElement>;
};

/* -------------------------------- breadcrumb ------------------------------- */

const Breadcrumb = ({
  section,
  title,
  titleRevealed,
}: Pick<DashboardTopBarProps, "section" | "title" | "titleRevealed">) => {
  const reduce = useReducedMotion();
  const [compact, setCompact] = React.useState(false);

  // Resolved after mount for the same reason the ⌘K badge is: a media query
  // read during render would make the server and the client disagree.
  React.useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Wide: the page's own heading is on screen, so the bar stays quiet until it
  // leaves. Narrow: there is no section link to fall back on, so the title is
  // the only thing naming the page and it never hides.
  const showTitle = Boolean(title) && (compact || titleRevealed);

  return (
    <nav
      aria-label="مسیر صفحه"
      className="flex min-w-0 flex-1 items-center text-sm"
    >
      <ol className="flex min-w-0 items-center gap-1.5">
        {section && (
          <li className="hidden min-w-0 shrink-0 sm:block">
            <Link
              href={section.href}
              className="block truncate rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {section.label}
            </Link>
          </li>
        )}

        {/* The whole crumb comes and goes, rather than an <li> that empties:
            a list item with nothing in it is still an item to a screen
            reader. */}
        <AnimatePresence initial={false}>
          {showTitle && (
            <motion.li
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
              className="flex min-w-0 items-center gap-1.5"
            >
              {/* RTL: the trail runs right to left, so the chevron points
                  left. It travels with the title rather than the section — a
                  separator with nothing after it reads as a broken trail,
                  which is what the bar showed until the title scrolled in. */}
              {section && (
                <ChevronLeft
                  aria-hidden
                  className="hidden size-3.5 shrink-0 text-muted/60 sm:block"
                />
              )}
              <span aria-current="page" className="min-w-0 truncate font-medium">
                {title}
              </span>
            </motion.li>
          )}
        </AnimatePresence>
      </ol>
    </nav>
  );
};

/* ------------------------------- account menu ------------------------------ */

const AccountMenu = ({
  businessName,
  profile,
  themeReady,
  onOpenSettings,
  onRequestSignOut,
}: Pick<
  DashboardTopBarProps,
  | "businessName"
  | "profile"
  | "themeReady"
  | "onOpenSettings"
  | "onRequestSignOut"
>) => {
  const reduce = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);

  const displayName =
    businessName.trim() || profile?.name?.trim() || "کسب‌وکار من";

  const itemClass =
    "flex h-10 cursor-pointer items-center gap-3 rounded-2xl px-3 text-sm text-muted outline-none transition-colors data-[highlighted]:bg-card/70 data-[highlighted]:text-foreground";

  const handleSelectSettings = () => {
    setOpen(false);
    window.requestAnimationFrame(() => onOpenSettings());
  };

  const handleSelectSignOut = () => {
    setOpen(false);
    window.requestAnimationFrame(() => onRequestSignOut());
  };

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen} dir="rtl">
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`منوی حساب ${displayName}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {displayName.charAt(0)}
        </button>
      </DropdownMenuPrimitive.Trigger>

      <AnimatePresence>
        {open && (
          <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
              asChild
              align="end"
              sideOffset={10}
              className="z-50"
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
                className="glass-strong w-64 rounded-3xl p-2 shadow-lift"
              >
                <DropdownMenuPrimitive.Label className="px-3 py-2">
                  <span className="block truncate text-sm font-medium">
                    {displayName}
                  </span>
                  {profile?.email && (
                    <span
                      dir="ltr"
                      className="block truncate text-start text-xs text-muted"
                    >
                      {profile.email}
                    </span>
                  )}
                </DropdownMenuPrimitive.Label>

                <DropdownMenuPrimitive.Separator className="my-1.5 h-px bg-line" />

                <DropdownMenuPrimitive.Item
                  className={itemClass}
                  onSelect={handleSelectSettings}
                >
                  <Settings2 className="size-4 shrink-0" aria-hidden />
                  <span>تنظیمات</span>
                </DropdownMenuPrimitive.Item>

                <DropdownMenuPrimitive.Separator className="my-1.5 h-px bg-line" />

                <DropdownMenuPrimitive.Label className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-medium text-muted/80">
                  <Palette className="size-3.5" aria-hidden />
                  ظاهر
                </DropdownMenuPrimitive.Label>
                <DropdownMenuPrimitive.RadioGroup
                  value={themeReady ? theme : undefined}
                  onValueChange={setTheme}
                >
                  {THEME_OPTIONS.map((option) => (
                    <DropdownMenuPrimitive.RadioItem
                      key={option.value}
                      value={option.value}
                      disabled={!themeReady}
                      className={itemClass}
                    >
                      <option.icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1">{option.label}</span>
                      <DropdownMenuPrimitive.ItemIndicator>
                        <Check className="size-3.5 text-accent" aria-hidden />
                      </DropdownMenuPrimitive.ItemIndicator>
                    </DropdownMenuPrimitive.RadioItem>
                  ))}
                </DropdownMenuPrimitive.RadioGroup>

                <DropdownMenuPrimitive.Separator className="my-1.5 h-px bg-line" />

                <DropdownMenuPrimitive.Item
                  className={itemClass}
                  onSelect={handleSelectSignOut}
                >
                  <LogOut className="size-4 shrink-0" aria-hidden />
                  <span>خروج از حساب</span>
                </DropdownMenuPrimitive.Item>
              </motion.div>
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        )}
      </AnimatePresence>
    </DropdownMenuPrimitive.Root>
  );
};

/* -------------------------------- inbox badge ------------------------------ */

const InboxBadge = () => {
  const pathname = usePathname();
  const { openCount, refresh } = useInboxCount();
  const lastCountedAt = React.useRef(0);
  const wasOnInbox = React.useRef(false);

  // Answering or closing a conversation happens on the inbox page, so leaving
  // it is the moment the count is most likely stale — that one re-counts
  // immediately. Every other navigation only re-counts a number old enough to
  // distrust, so walking through a section's tabs is not a request per tab.
  React.useEffect(() => {
    const onInbox = pathname.startsWith("/dashboard/inbox");
    const leftInbox = wasOnInbox.current && !onInbox;
    wasOnInbox.current = onInbox;

    const now = Date.now();
    if (!leftInbox && now - lastCountedAt.current < INBOX_COUNT_TTL) return;

    lastCountedAt.current = now;
    void refresh();
  }, [pathname, refresh]);

  const count = typeof openCount === "number" ? openCount : 0;
  const label =
    count > 0 ? `صندوق پیام‌ها — ${fa(count)} گفتگوی باز` : "صندوق پیام‌ها";

  return (
    <Tooltip content={label} side="bottom">
      <Link
        href="/dashboard/inbox"
        aria-label={label}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Inbox className="size-[1.15rem]" aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-white"
          >
            {count > MAX_BADGE_COUNT ? `${fa(MAX_BADGE_COUNT)}+` : fa(count)}
          </span>
        )}
      </Link>
    </Tooltip>
  );
};

/* --------------------------------- top bar --------------------------------- */

export const DashboardTopBar = ({
  businessName,
  isAdmin,
  profile,
  section,
  title,
  titleRevealed,
  scrolled,
  sidebarOpen,
  themeReady,
  onToggleSidebar,
  onOpenSettings,
  onRequestSignOut,
  sidebarToggleRef,
  mobileMenuTriggerRef,
}: DashboardTopBarProps) => {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [isMac, setIsMac] = React.useState(false);

  // Resolved after mount: reading the user agent during render would make the
  // server and the client disagree about the badge.
  React.useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(window.navigator.userAgent));
  }, []);

  const shortcut = isMac ? "⌘K" : "Ctrl K";

  React.useEffect(() => {
    const openOnShortcut = (event: KeyboardEvent) => {
      if (event.key?.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;

      event.preventDefault();
      // Already open: the same chord closes it again.
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      // Something modal is up (settings, sign-out confirmation, the mobile
      // drawer). Opening a palette over it would trap focus in two places.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      setPaletteOpen(true);
    };

    document.addEventListener("keydown", openOnShortcut);
    return () => document.removeEventListener("keydown", openOnShortcut);
  }, [paletteOpen]);

  const groups = React.useMemo<CommandGroup[]>(() => {
    const routeItem = (route: DashboardRoute) => ({
      id: `route:${route.href}`,
      label: route.title,
      description: route.section?.label,
      icon: route.icon,
      keywords: route.keywords,
      onSelect: () => router.push(route.href),
    });

    return [
      {
        id: "navigate",
        label: "رفتن به",
        items: DASHBOARD_ROUTES.filter(
          (route) => !route.unlisted && (!route.adminOnly || isAdmin)
        ).map(routeItem),
      },
      {
        id: "actions",
        label: "کارها",
        items: [
          {
            id: "action:settings-profile",
            label: "تنظیمات حساب",
            icon: Settings2,
            keywords: ["پروفایل", "نام", "settings", "profile"],
            onSelect: () => onOpenSettings("profile"),
          },
          {
            id: "action:settings-business",
            label: "اطلاعات کسب‌وکار",
            icon: Settings2,
            keywords: ["نام کسب‌وکار", "صنف", "دسته", "business"],
            onSelect: () => onOpenSettings("business"),
          },
          {
            id: "action:settings-connections",
            label: "اتصال‌ها",
            icon: Settings2,
            keywords: ["تلگرام", "ربات", "connection"],
            onSelect: () => onOpenSettings("connections"),
          },
          ...THEME_OPTIONS.map((option) => ({
            id: `action:theme-${option.value}`,
            label: `ظاهر: ${option.label}`,
            icon: option.icon,
            keywords: ["تم", "رنگ", "روشن", "تاریک", "theme"],
            onSelect: () => setTheme(option.value),
          })),
          {
            id: "action:toggle-sidebar",
            label: sidebarOpen ? "بستن سایدبار" : "باز کردن سایدبار",
            icon: sidebarOpen
              ? TbLayoutSidebarRightCollapse
              : TbLayoutSidebarRightExpand,
            keywords: ["سایدبار", "منو", "sidebar"],
            onSelect: onToggleSidebar,
          },
          {
            id: "action:sign-out",
            label: "خروج از حساب",
            icon: LogOut,
            keywords: ["لاگ اوت", "بیرون", "logout", "sign out"],
            onSelect: onRequestSignOut,
          },
        ],
      },
    ];
  }, [
    isAdmin,
    onOpenSettings,
    onRequestSignOut,
    onToggleSidebar,
    router,
    setTheme,
    sidebarOpen,
  ]);

  const toggleLabel = sidebarOpen ? "بستن سایدبار" : "باز کردن سایدبار";

  return (
    <>
      {/* At the top of a page the bar is part of the page: no line, no glass,
          nothing to separate it from content it is not yet overlapping. The
          border and the frosting arrive together, the moment content starts
          passing underneath. The transparent border is always in the box so the
          arrival costs no layout shift. */}
      <header
        className={cn(
          "sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-xl transition-colors duration-300 sm:px-4",
          scrolled
            ? "border-line bg-background/85"
            : "border-transparent bg-background"
        )}
      >
        {/* Below xl the drawer trigger; at xl the sidebar collapse control,
            which used to live inside the rail itself. */}
        <DialogPrimitive.Trigger asChild>
          <button
            ref={mobileMenuTriggerRef}
            type="button"
            aria-label="باز کردن منوی داشبورد"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 xl:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </DialogPrimitive.Trigger>

        <Tooltip content={toggleLabel} side="bottom">
          <button
            ref={sidebarToggleRef}
            type="button"
            data-sidebar-toggle
            aria-label={toggleLabel}
            aria-expanded={sidebarOpen}
            onClick={onToggleSidebar}
            className="hidden size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 xl:flex"
          >
            {sidebarOpen ? (
              <TbLayoutSidebarRightCollapse className="size-5" aria-hidden />
            ) : (
              <TbLayoutSidebarRightExpand className="size-5" aria-hidden />
            )}
          </button>
        </Tooltip>

        {/* No rule between the toggle and the trail — the button's own padding
            already separates them, and Notion does not draw a line it can get
            away without. */}
        <Breadcrumb
          section={section}
          title={title}
          titleRevealed={titleRevealed}
        />

        {/* Visible affordance, not a shortcut only power users discover. */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="جستجو و دستورها"
          className="flex h-9 shrink-0 items-center gap-2 rounded-full text-muted transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:w-56 sm:justify-start sm:border sm:border-line sm:bg-surface/60 sm:px-3 max-sm:size-9 max-sm:justify-center"
        >
          <Search className="size-[1.15rem] shrink-0 sm:size-4" aria-hidden />
          <span className="hidden flex-1 text-start text-sm sm:block">
            جستجو…
          </span>
          <span
            dir="ltr"
            aria-hidden
            className="hidden rounded-lg border border-line px-1.5 py-0.5 text-[11px] tabular-nums sm:block"
          >
            {shortcut}
          </span>
        </button>

        <InboxBadge />

        <AccountMenu
          businessName={businessName}
          profile={profile}
          themeReady={themeReady}
          onOpenSettings={onOpenSettings}
          onRequestSignOut={onRequestSignOut}
        />
      </header>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={groups}
        placeholder="بگردید یا دستوری را اجرا کنید…"
        emptyState="چیزی با این عبارت پیدا نشد."
      />
    </>
  );
};
