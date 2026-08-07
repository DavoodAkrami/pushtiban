"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Gauge,
  LogOut,
  Palette,
  Settings2,
  X,
} from "lucide-react";
import { LogoutConfirmationModal } from "@/components/dashboard/logout-confirmation-modal";
import { SettingsModal } from "@/components/dashboard/settings-modal";
import { DashboardTopBar } from "@/components/dashboard/top-bar";
import { DashboardTitleContext } from "@/components/dashboard/title-context";
import { luxe } from "@/components/motion/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/brand/logo";
import {
  SETTINGS_OPEN_EVENT,
  type SettingsSection,
} from "@/lib/settings-events";
import {
  instagramErrorMessage,
  INSTAGRAM_CONNECTED_MESSAGE,
} from "@/lib/instagram/messages";
import type { SessionProfile } from "@/store/slices/session-slice";
import { useSessionProfile } from "@/store/use-session";
import { useBusinessUsage } from "@/store/use-usage";
import {
  ADMIN_NAV_GROUP,
  EXACT_MATCH_HREFS,
  NAV_GROUPS,
  resolveRoute,
  type NavItem,
} from "@/lib/dashboard/navigation";
import { THEME_OPTIONS } from "@/lib/dashboard/theme";

const SIDEBAR_STATE_KEY = "pushtiban:sidebar-open";

/**
 * Height of the top bar (h-14). The bar is sticky *inside* the scroll
 * container, so it overlaps the content beneath it — an IntersectionObserver
 * rooted there would call a heading "visible" while the bar sits on top of it.
 * Shrinking the root by exactly the bar's height makes both handoffs below fire
 * on what the reader can actually see.
 */
const BAR_HEIGHT = 56;
const UNDER_BAR_MARGIN = `-${BAR_HEIGHT}px 0px 0px 0px`;

/**
 * Fallback for the title handoff on a page with no h1 of its own: how far it
 * must scroll before the bar takes over. A real heading is measured rather than
 * guessed — this only stands in until (or unless) one exists.
 */
const TITLE_REVEAL_OFFSET = 160;

const OPEN_W = 264;
const CLOSED_W = 76;

type AccountSectionProps = {
  actionsId: string;
  businessName: string;
  expanded: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onOpenSettings: () => void;
  onRequestSignOut: () => void;
  profile: SessionProfile | null | undefined;
  themeReady: boolean;
  triggerRef?: React.Ref<HTMLButtonElement>;
};

const UserChip = ({
  actionsId,
  businessName,
  expanded,
  menuOpen,
  onToggle,
  profile,
  triggerRef,
}: {
  actionsId: string;
  businessName: string;
  expanded: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  profile: SessionProfile | null | undefined;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) => {
  const displayName =
    businessName.trim() || profile?.name?.trim() || "کسب‌وکار من";
  const initial = displayName.charAt(0);

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-label={`منوی حساب ${displayName}`}
      aria-controls={actionsId}
      aria-expanded={menuOpen}
      onClick={onToggle}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-2xl p-3 text-start transition-colors duration-300 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        !expanded && "justify-center p-2"
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
        {initial}
      </span>
      {expanded && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {displayName}
            </span>
            {profile === undefined ? (
              <Skeleton className="mt-1.5 h-3 w-28" />
            ) : profile?.email ? (
              <span
                dir="ltr"
                className="block truncate text-start text-xs text-muted"
              >
                {profile.email}
              </span>
            ) : (
              <span className="block truncate text-xs text-muted">
                حساب پشتیبان
              </span>
            )}
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 text-muted"
            aria-hidden
          />
        </>
      )}
    </button>
  );
};

const DashboardNavigation = ({
  expanded,
  isAdmin,
  onNavigate,
  pathname,
}: {
  expanded: boolean;
  isAdmin: boolean;
  onNavigate?: () => void;
  pathname: string;
}) => {
  const navGroups = isAdmin ? [...NAV_GROUPS, ADMIN_NAV_GROUP] : NAV_GROUPS;

  const renderLink = (item: NavItem) => {
    const active =
      pathname === item.href ||
      (!EXACT_MATCH_HREFS.has(item.href) &&
        pathname.startsWith(`${item.href}/`));

    const link = (
      <Link
        href={item.href}
        onClick={() => onNavigate?.()}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm transition-colors duration-300 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          !expanded && "justify-center px-0",
          active ? "bg-card/70 font-medium text-foreground" : "text-muted"
        )}
      >
        <item.icon className="size-[1.15rem] shrink-0" aria-hidden />
        {expanded && (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.comingSoon && (
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                به‌زودی
              </span>
            )}
          </>
        )}
      </Link>
    );

    return (
      <li key={item.id}>
        {expanded ? (
          link
        ) : (
          <Tooltip content={item.label} side="end" wrapperClassName="w-full">
            {link}
          </Tooltip>
        )}
      </li>
    );
  };

  return (
    <nav
      aria-label="بخش‌های داشبورد"
      className={cn(
        "mt-8 min-h-0 flex-1 overscroll-contain",
        expanded ? "overflow-y-auto" : "overflow-visible"
      )}
    >
      {navGroups.map((group, groupIndex) => (
        <section key={group.id} aria-label={group.label ?? "میان‌برها"}>
          {/* Group separator: a labeled heading when expanded, a hairline
              when collapsed, nothing before the first group. */}
          {groupIndex > 0 &&
            (expanded && group.label ? (
              <p
                aria-hidden
                className="mb-1 mt-5 truncate px-3 text-[11px] font-medium text-muted/80"
              >
                {group.label}
              </p>
            ) : (
              <div aria-hidden className="mx-3 my-3 border-t border-line" />
            ))}
          <ul className="space-y-1">{group.items.map(renderLink)}</ul>
        </section>
      ))}
    </nav>
  );
};

/**
 * Used AI messages this month, read from the shared usage slice. Renders
 * nothing for accounts without a message cap (unlimited) — there is no quota to
 * report. Collapsed sidebar shows just the used count with a tooltip.
 */
const MessageQuota = ({ expanded }: { expanded: boolean }) => {
  const reduce = useReducedMotion();
  const { usage } = useBusinessUsage();

  if (usage === undefined) {
    return (
      <div className="mt-4 shrink-0">
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    );
  }

  const limit = usage?.monthlyMessageLimit ?? null;
  if (!usage || limit === null) return null;

  const used = Math.min(limit, usage.monthMessages);
  const usedRatio = limit > 0 ? used / limit : 1;
  const leftRatio = 1 - usedRatio;

  const tone = usage.aiBlocked || used >= limit
    ? { bar: "bg-danger", text: "text-danger" }
    : leftRatio <= 0.25
      ? { bar: "bg-warning", text: "text-warning" }
      : { bar: "bg-accent", text: "text-foreground" };

  const summary = usage.aiBlocked
    ? "دستیار این حساب توسط مدیر سایت مسدود شده است."
    : `${fa(used)} از ${fa(limit)} پیام این ماه مصرف شده است.`;
  // Short enough to fit inside the sidebar width when shown above the card.
  const tooltipLabel = usage.aiBlocked ? "دستیار مسدود شده است." : summary;

  if (!expanded) {
    return (
      <div className="mt-4 shrink-0">
        <Tooltip content={tooltipLabel} side="end" wrapperClassName="w-full">
          <div
            role="img"
            aria-label={summary}
            className="flex h-11 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-card/40"
          >
            <Gauge className={cn("size-4", tone.text)} aria-hidden />
            <span className={cn("text-[10px] font-bold tabular-nums", tone.text)}>
              {fa(used)}
            </span>
          </div>
        </Tooltip>
      </div>
    );
  }

  // Expanded: one compact line plus the bar. The full explanation lives on the
  // overview page — the sidebar should not spend three lines of prose on it.
  return (
    <Tooltip content={tooltipLabel} side="top" wrapperClassName="w-full">
      <Link
        href="/dashboard/overview"
        className="mt-4 block shrink-0 rounded-2xl bg-card/40 p-3 transition-colors duration-300 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <div className="flex items-center gap-2">
          <Gauge className={cn("size-4 shrink-0", tone.text)} aria-hidden />
          <span className="text-xs text-muted">پیام‌های این ماه</span>
          <span
            className={cn("ms-auto text-xs font-bold tabular-nums", tone.text)}
          >
            {fa(used)}/{fa(limit)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="پیام‌های مصرف‌شده این ماه"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
          aria-valuetext={summary}
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line/60"
        >
          <motion.div
            initial={false}
            animate={{ width: `${Math.max(2, Math.round(usedRatio * 100))}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: luxe }}
            className={cn("h-full rounded-full", tone.bar)}
          />
        </div>
      </Link>
    </Tooltip>
  );
};

const AccountSection = ({
  actionsId,
  businessName,
  expanded,
  menuOpen,
  onMenuToggle,
  onOpenSettings,
  onRequestSignOut,
  profile,
  themeReady,
  triggerRef,
}: AccountSectionProps) => {
  const reduce = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const [themeSelectorOpen, setThemeSelectorOpen] = React.useState(false);
  const themeOptionsId = `${actionsId}-theme-options`;
  const selectedTheme = themeReady
    ? THEME_OPTIONS.find((option) => option.value === theme)
    : undefined;

  React.useEffect(() => {
    if (!menuOpen) setThemeSelectorOpen(false);
  }, [menuOpen]);

  const chip = (
    <UserChip
      actionsId={actionsId}
      expanded={expanded}
      profile={profile}
      businessName={businessName}
      menuOpen={menuOpen}
      onToggle={onMenuToggle}
      triggerRef={triggerRef}
    />
  );

  return (
    <div className="mt-4 flex shrink-0 flex-col-reverse border-t border-line pt-3">
      {expanded ? (
        chip
      ) : (
        <Tooltip
          content="باز کردن منوی حساب"
          side="end"
          wrapperClassName="w-full"
        >
          {chip}
        </Tooltip>
      )}

      <AnimatePresence initial={false}>
        {expanded && menuOpen && (
          <motion.div
            id={actionsId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: luxe }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pb-2">
              {/* Called with no argument on purpose: the handler takes an
                  optional section, and passing it straight to onClick would
                  hand it the click event as that section. */}
              <button
                type="button"
                onClick={() => onOpenSettings()}
                className="flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm text-muted transition-colors duration-300 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <Settings2 className="size-4 shrink-0" aria-hidden />
                <span>تنظیمات</span>
              </button>
              <button
                type="button"
                aria-controls={themeOptionsId}
                aria-expanded={themeSelectorOpen}
                onClick={() => setThemeSelectorOpen((value) => !value)}
                className="flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm text-muted transition-colors duration-300 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <Palette className="size-4 shrink-0" aria-hidden />
                <span>ظاهر</span>
                <span className="ms-auto text-xs text-muted">
                  {selectedTheme?.label ?? "انتخاب"}
                </span>
                <motion.span
                  animate={{ rotate: themeSelectorOpen ? 180 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
                  className="shrink-0"
                >
                  <ChevronDown className="size-4" aria-hidden />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {themeSelectorOpen && (
                  <motion.div
                    id={themeOptionsId}
                    role="radiogroup"
                    aria-label="حالت نمایش"
                    initial={
                      reduce ? { opacity: 0 } : { height: 0, opacity: 0 }
                    }
                    animate={{ height: "auto", opacity: 1 }}
                    exit={
                      reduce ? { opacity: 0 } : { height: 0, opacity: 0 }
                    }
                    transition={{ duration: reduce ? 0 : 0.22, ease: luxe }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-background/70 p-1">
                      {THEME_OPTIONS.map((option) => {
                        const selected = selectedTheme?.value === option.value;

                        return (
                          <label
                            key={option.value}
                            className={cn(
                              "relative flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-xs transition-colors duration-300",
                              selected
                                ? "bg-card text-foreground"
                                : "text-muted hover:bg-card/50 hover:text-foreground"
                            )}
                          >
                            <input
                              type="radio"
                              name={`${actionsId}-theme`}
                              value={option.value}
                              checked={selected}
                              disabled={!themeReady}
                              onChange={() => setTheme(option.value)}
                              className="peer sr-only"
                            />
                            <option.icon className="size-4" aria-hidden />
                            <span>{option.label}</span>
                            {selected && (
                              <Check
                                className="absolute end-1.5 top-1.5 size-3 text-accent"
                                aria-hidden
                              />
                            )}
                            <span
                              className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60"
                              aria-hidden
                            />
                          </label>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="button"
                onClick={onRequestSignOut}
                className="flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm text-muted transition-colors duration-300 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <LogOut className="size-4 shrink-0" aria-hidden />
                <span>خروج از حساب</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MobileNavigationDrawer = ({
  accountTriggerRef,
  businessName,
  isAdmin,
  menuOpen,
  onMenuToggle,
  onNavigate,
  onFocusDesktopNavigation,
  onOpenSettings,
  onRequestSignOut,
  open,
  pathname,
  profile,
  themeReady,
}: {
  accountTriggerRef: React.RefObject<HTMLButtonElement | null>;
  businessName: string;
  isAdmin: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onNavigate: () => void;
  onFocusDesktopNavigation: () => void;
  onOpenSettings: () => void;
  onRequestSignOut: () => void;
  open: boolean;
  pathname: string;
  profile: SessionProfile | null | undefined;
  themeReady: boolean;
}) => {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
              className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm xl:hidden"
            />
          </DialogPrimitive.Overlay>

          <DialogPrimitive.Content
            asChild
            forceMount
            onEscapeKeyDown={(event) => {
              if (!menuOpen) return;
              event.preventDefault();
              onMenuToggle();
              window.requestAnimationFrame(() =>
                accountTriggerRef.current?.focus()
              );
            }}
            onCloseAutoFocus={(event) => {
              if (!window.matchMedia("(min-width: 1280px)").matches) return;
              event.preventDefault();
              onFocusDesktopNavigation();
            }}
          >
            <motion.aside
              initial={reduce ? { opacity: 0 } : { x: "100%" }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { x: "100%" }}
              transition={{ duration: reduce ? 0 : 0.32, ease: luxe }}
              className="fixed inset-y-0 start-0 z-50 flex h-dvh w-[min(20rem,calc(100vw-1rem))] flex-col overflow-y-auto overscroll-contain border-e border-line bg-surface p-4 shadow-lift outline-none xl:hidden"
            >
              <header className="flex h-11 shrink-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Logo variant="icon" size="xl" className="flex-shrink-0" />
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="truncate text-sm font-bold">
                      پشتیبان
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="truncate text-xs text-muted">
                      منوی داشبورد
                    </DialogPrimitive.Description>
                  </div>
                </div>

                <DialogPrimitive.Close
                  aria-label="بستن منوی داشبورد"
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <X className="size-5" aria-hidden />
                </DialogPrimitive.Close>
              </header>

              <DashboardNavigation
                expanded
                isAdmin={isAdmin}
                pathname={pathname}
                onNavigate={onNavigate}
              />

              <MessageQuota expanded />

              <AccountSection
                actionsId="dashboard-mobile-account-actions"
                expanded
                profile={profile}
                businessName={businessName}
                menuOpen={menuOpen}
                onMenuToggle={onMenuToggle}
                onOpenSettings={onOpenSettings}
                onRequestSignOut={onRequestSignOut}
                themeReady={themeReady}
                triggerRef={accountTriggerRef}
              />
            </motion.aside>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
};

export const DashboardShell = ({
  children,
  businessCategory,
  businessName,
  email,
  fullName,
  isAdmin = false,
}: {
  children: React.ReactNode;
  businessCategory: string;
  businessName: string;
  email: string;
  fullName: string;
  isAdmin?: boolean;
}) => {
  // UI state stays local; session data comes from the Redux profile slice.
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [titleRevealed, setTitleRevealed] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [overrideTitle, setOverrideTitle] = React.useState<string | null>(null);
  const [desktopProfileMenuOpen, setDesktopProfileMenuOpen] =
    React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [mobileProfileMenuOpen, setMobileProfileMenuOpen] =
    React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSection, setSettingsSection] =
    React.useState<SettingsSection>("profile");
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] =
    React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [themeReady, setThemeReady] = React.useState(false);
  const [currentBusinessName, setCurrentBusinessName] =
    React.useState(businessName);
  const [currentBusinessCategory, setCurrentBusinessCategory] =
    React.useState(businessCategory);
  const [currentFullName, setCurrentFullName] = React.useState(fullName);
  const desktopToggleRef = React.useRef<HTMLButtonElement>(null);
  const desktopAccountTriggerRef = React.useRef<HTMLButtonElement>(null);
  const mobileAccountTriggerRef = React.useRef<HTMLButtonElement>(null);
  const mobileMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const pageScrollRef = React.useRef<HTMLDivElement>(null);
  const mainRef = React.useRef<HTMLElement>(null);
  const scrollSentinelRef = React.useRef<HTMLDivElement>(null);
  const titleSentinelRef = React.useRef<HTMLDivElement>(null);
  const profile = useSessionProfile();
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const { toast } = useToast();

  const route = resolveRoute(pathname);

  const toggleSidebar = () => {
    setSidebarOpen((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_STATE_KEY, next ? "1" : "0");
      } catch {
        // Private mode or a full quota — a lost preference is not worth failing over.
      }
      return next;
    });
    setDesktopProfileMenuOpen(false);
  };

  // While collapsed the whole rail expands it, so the narrow strip is not a
  // pixel hunt for one 36px button — but never at the cost of a real control,
  // so clicks that land on a link, button or field are left to it.
  const expandFromRailClick = (event: React.MouseEvent<HTMLElement>) => {
    if (sidebarOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, input, label, [role='button']")) return;
    toggleSidebar();
  };

  const toggleDesktopProfileMenu = () => {
    if (!sidebarOpen) {
      setSidebarOpen(true);
      setDesktopProfileMenuOpen(true);
      return;
    }
    setDesktopProfileMenuOpen((value) => !value);
  };

  const openSettings = (section: SettingsSection = "profile") => {
    const openedFromMobile = mobileNavOpen;
    setDesktopProfileMenuOpen(false);
    setMobileProfileMenuOpen(false);
    setMobileNavOpen(false);
    setSettingsSection(section);

    if (openedFromMobile) {
      window.requestAnimationFrame(() => setSettingsOpen(true));
      return;
    }
    setSettingsOpen(true);
  };

  React.useEffect(() => {
    const handleSettingsRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: SettingsSection }>).detail;
      setDesktopProfileMenuOpen(false);
      setMobileProfileMenuOpen(false);
      setMobileNavOpen(false);
      setSettingsSection(detail?.section ?? "profile");
      window.requestAnimationFrame(() => setSettingsOpen(true));
    };

    window.addEventListener(SETTINGS_OPEN_EVENT, handleSettingsRequest);
    return () =>
      window.removeEventListener(SETTINGS_OPEN_EVENT, handleSettingsRequest);
  }, []);

  // Connecting Instagram leaves the app for Meta's consent screen, so the
  // outcome comes back in the query string rather than in React state. Report
  // it once, reopen whatever the owner had open, then strip the query so a
  // refresh does not repeat the toast.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("instagram");
    const section = params.get("settings");
    if (!outcome && !section) return;

    if (section === "connections") {
      window.requestAnimationFrame(() => {
        setSettingsSection("connections");
        setSettingsOpen(true);
      });
    }

    // "cancelled" stays silent: declining on Instagram's screen is a choice,
    // not something to apologise for.
    if (outcome === "connected") {
      toast({ ...INSTAGRAM_CONNECTED_MESSAGE, variant: "success" });
    } else if (outcome === "error") {
      toast({
        ...instagramErrorMessage(params.get("reason")),
        variant: "error",
      });
    }

    params.delete("instagram");
    params.delete("reason");
    params.delete("settings");
    const query = params.toString();
    router.replace(
      `${window.location.pathname}${query ? `?${query}` : ""}`,
      { scroll: false }
    );
  }, [router, toast]);

  const openSignOutConfirmation = () => {
    const openedFromMobile = mobileNavOpen;
    setDesktopProfileMenuOpen(false);
    setMobileProfileMenuOpen(false);
    setMobileNavOpen(false);

    if (openedFromMobile) {
      window.requestAnimationFrame(() => setLogoutConfirmationOpen(true));
      return;
    }
    setLogoutConfirmationOpen(true);
  };

  const changeMobileNavigation = (nextOpen: boolean) => {
    setMobileNavOpen(nextOpen);
    if (!nextOpen) setMobileProfileMenuOpen(false);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setSigningOut(false);
        toast({
          title: "خروج از حساب انجام نشد",
          description: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      setLogoutConfirmationOpen(false);
      router.replace("/auth");
      router.refresh();
    } catch {
      setSigningOut(false);
      toast({
        title: "خروج از حساب انجام نشد",
        description: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
        variant: "error",
      });
    }
  };

  React.useEffect(() => {
    if (!desktopProfileMenuOpen && !mobileProfileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const restoreDesktopFocus = desktopProfileMenuOpen;
      setDesktopProfileMenuOpen(false);
      setMobileProfileMenuOpen(false);
      if (restoreDesktopFocus) {
        window.requestAnimationFrame(() =>
          desktopAccountTriggerRef.current?.focus()
        );
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [desktopProfileMenuOpen, mobileProfileMenuOpen]);

  React.useEffect(() => {
    setCurrentBusinessName(businessName);
    setCurrentBusinessCategory(businessCategory);
    setCurrentFullName(fullName);
  }, [businessCategory, businessName, fullName]);

  React.useEffect(() => setThemeReady(true), []);

  // Read the persisted sidebar state after mount. Doing it in the initialiser
  // would desync the server render from the client one.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STATE_KEY);
      if (stored !== null) setSidebarOpen(stored === "1");
    } catch {
      // No storage access — keep the default.
    }
  }, []);

  React.useEffect(() => {
    setMobileNavOpen(false);
    setMobileProfileMenuOpen(false);
    setDesktopProfileMenuOpen(false);
    // A new route starts at the top, so the bar starts quiet again. Setting it
    // here rather than waiting for the observer avoids a frame of stale title.
    setTitleRevealed(false);
    pageScrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Has anything at all passed under the bar? That is the whole question, and
  // the answer is what turns the bar's border and frosting on. The page scrolls
  // inside pageScrollRef, not the window, so both observers here are rooted
  // there — a default-root observer would never fire.
  React.useEffect(() => {
    const root = pageScrollRef.current;
    const sentinel = scrollSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { root, rootMargin: UNDER_BAR_MARGIN, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // The bar's title stands in for the page's own h1, so the h1 itself decides
  // when the bar takes over: the handoff lands exactly as the heading slides
  // under the bar, with no scroll band where the title is in neither place.
  //
  // A panel that fetches before it renders has no h1 on its first frame, so a
  // MutationObserver waits for one and the fixed band stands in meanwhile. It
  // stops watching as soon as a heading turns up — the flow builder's canvas
  // mutates its subtree constantly and is not worth re-querying over.
  React.useEffect(() => {
    const root = pageScrollRef.current;
    const main = mainRef.current;
    if (!root || !main) return;

    let target: Element | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => setTitleRevealed(!entry.isIntersecting),
      { root, rootMargin: UNDER_BAR_MARGIN, threshold: 0 }
    );

    const watch = (next: Element | null) => {
      if (!next || next === target) return;
      if (target) observer.unobserve(target);
      target = next;
      observer.observe(next);
    };

    const mutations = new MutationObserver(() => {
      const heading = main.querySelector("h1");
      if (!heading) return;
      watch(heading);
      mutations.disconnect();
    });

    watch(titleSentinelRef.current);

    const heading = main.querySelector("h1");
    if (heading) watch(heading);
    else mutations.observe(main, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  React.useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    const closeDrawerOnDesktop = () => {
      if (desktopQuery.matches) {
        setMobileNavOpen(false);
        setMobileProfileMenuOpen(false);
      }
    };
    closeDrawerOnDesktop();
    desktopQuery.addEventListener("change", closeDrawerOnDesktop);
    return () =>
      desktopQuery.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  return (
    <div className="h-dvh overflow-hidden bg-background xl:flex">
      <motion.aside
        aria-label="سایدبار داشبورد"
        animate={{ width: sidebarOpen ? OPEN_W : CLOSED_W }}
        transition={reduce ? { duration: 0 } : { duration: 0.45, ease: luxe }}
        onClick={expandFromRailClick}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col overflow-visible border-e border-line bg-surface/60 p-4 xl:flex",
          // RTL: the rail sits on the right, so it widens westward.
          !sidebarOpen && "cursor-w-resize"
        )}
      >
        {/* The collapse toggle now lives in the top bar, so the rail's header
            is purely the brand — and a link home at either width. Clicking
            anywhere else on a collapsed rail still expands it. */}
        <Link
          href="/dashboard/overview"
          aria-label="پشتیبان — نمای کلی"
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-full text-start font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            !sidebarOpen && "justify-center"
          )}
        >
          <Logo variant="icon" size="sm" className="flex-shrink-0" as="span" />
          {sidebarOpen && <span className="truncate">پشتیبان</span>}
        </Link>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            sidebarOpen
              ? "overflow-y-auto overscroll-contain"
              : "overflow-visible"
          )}
        >
          <DashboardNavigation
            expanded={sidebarOpen}
            isAdmin={isAdmin}
            pathname={pathname}
            onNavigate={() => setDesktopProfileMenuOpen(false)}
          />

          <MessageQuota expanded={sidebarOpen} />

          <AccountSection
            actionsId="dashboard-desktop-account-actions"
            expanded={sidebarOpen}
            profile={profile}
            businessName={currentBusinessName}
            menuOpen={desktopProfileMenuOpen}
            onMenuToggle={toggleDesktopProfileMenu}
            onOpenSettings={openSettings}
            onRequestSignOut={openSignOutConfirmation}
            themeReady={themeReady}
            triggerRef={desktopAccountTriggerRef}
          />
        </div>
      </motion.aside>

      <div
        ref={pageScrollRef}
        dir="rtl"
        className="h-dvh min-w-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <DialogPrimitive.Root
          open={mobileNavOpen}
          onOpenChange={changeMobileNavigation}
        >
          <DashboardTopBar
            businessName={currentBusinessName}
            isAdmin={isAdmin}
            profile={profile}
            section={route?.section ?? null}
            title={overrideTitle ?? route?.title ?? null}
            titleRevealed={titleRevealed}
            scrolled={scrolled}
            sidebarOpen={sidebarOpen}
            themeReady={themeReady}
            onToggleSidebar={toggleSidebar}
            onOpenSettings={openSettings}
            onRequestSignOut={openSignOutConfirmation}
            sidebarToggleRef={desktopToggleRef}
            mobileMenuTriggerRef={mobileMenuTriggerRef}
          />
          <MobileNavigationDrawer
            accountTriggerRef={mobileAccountTriggerRef}
            open={mobileNavOpen}
            pathname={pathname}
            profile={profile}
            businessName={currentBusinessName}
            isAdmin={isAdmin}
            menuOpen={mobileProfileMenuOpen}
            onFocusDesktopNavigation={() => desktopToggleRef.current?.focus()}
            onMenuToggle={() =>
              setMobileProfileMenuOpen((value) => !value)
            }
            onNavigate={() => changeMobileNavigation(false)}
            onOpenSettings={openSettings}
            onRequestSignOut={openSignOutConfirmation}
            themeReady={themeReady}
          />
        </DialogPrimitive.Root>

        <main
          ref={mainRef}
          className="relative min-h-[calc(100dvh-3.5rem)] min-w-0 p-4 sm:p-6 md:p-8 xl:p-10"
        >
          {/* Both bands are absolutely positioned so they cost no space and no
              page has to know they are here. The first is the very top of the
              content — the moment it goes under the bar, the bar gains its
              border. The second is the title fallback for pages with no h1,
              see TITLE_REVEAL_OFFSET. */}
          {/* A few pixels rather than one: a 1px band sits exactly on the
              observer's boundary at rest, where sub-pixel rounding can flicker
              the border on and off. */}
          <div
            ref={scrollSentinelRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1"
          />
          <div
            ref={titleSentinelRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ height: TITLE_REVEAL_OFFSET }}
          />
          <DashboardTitleContext.Provider value={setOverrideTitle}>
            {children}
          </DashboardTitleContext.Provider>
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSection={settingsSection}
        fullName={currentFullName}
        businessName={currentBusinessName}
        businessCategory={currentBusinessCategory}
        email={email || profile?.email || ""}
        restoreFocus={() => {
          const target = window.matchMedia("(min-width: 1280px)").matches
            ? desktopAccountTriggerRef.current
            : mobileMenuTriggerRef.current;
          target?.focus();
        }}
        onProfileUpdated={(updatedProfile) => {
          setCurrentFullName(updatedProfile.fullName);
          setCurrentBusinessName(updatedProfile.businessName);
          setCurrentBusinessCategory(updatedProfile.businessCategory);
        }}
      />

      <LogoutConfirmationModal
        open={logoutConfirmationOpen}
        onOpenChange={setLogoutConfirmationOpen}
        onConfirm={signOut}
        signingOut={signingOut}
        restoreFocus={() => {
          const target = window.matchMedia("(min-width: 1280px)").matches
            ? desktopAccountTriggerRef.current
            : mobileMenuTriggerRef.current;
          target?.focus();
        }}
      />
    </div>
  );
};
