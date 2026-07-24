"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronsUpDown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Monitor,
  Moon,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  Sparkles,
  Sun,
  Workflow,
  X,
  BookOpen,
  HelpCircle,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import { LogoutConfirmationModal } from "@/components/dashboard/logout-confirmation-modal";
import { SettingsModal } from "@/components/dashboard/settings-modal";
import { luxe } from "@/components/motion/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { SessionProfile } from "@/store/slices/session-slice";
import { useSessionProfile } from "@/store/use-session";

type NavChild = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavItem =
  | { id: string; href: string; label: string; icon: LucideIcon }
  | { id: string; label: string; icon: LucideIcon; children: NavChild[] };

const NAV_ITEMS: NavItem[] = [
  { id: "overview", href: "/dashboard/overview", label: "نمای کلی", icon: LayoutDashboard },
  {
    id: "automation",
    label: "اتوماسیون",
    icon: Workflow,
    children: [
      { href: "/dashboard/flow", label: "فلوها", icon: GitBranch },
      {
        href: "/dashboard/automation",
        label: "پیام‌های آماده",
        icon: MessageSquareText,
      },
    ],
  },
  {
    id: "ai-assistance",
    label: "دستیار هوش مصنوعی",
    icon: Sparkles,
    children: [
      {
        href: "/dashboard/ai-assistance",
        label: "تنظیمات دستیار",
        icon: ToggleRight,
      },
      {
        href: "/dashboard/ai-assistance/facts",
        label: "اطلاعات کسب‌وکار",
        icon: BookOpen,
      },
      {
        href: "/dashboard/ai-assistance/qa",
        label: "پرسش و پاسخ",
        icon: HelpCircle,
      },
    ],
  },
];

const OPEN_W = 264;
const CLOSED_W = 76;

const THEME_OPTIONS = [
  { value: "light", label: "روشن", icon: Sun },
  { value: "dark", label: "تاریک", icon: Moon },
  { value: "system", label: "سیستم", icon: Monitor },
] as const;

const SIDEBAR_INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='radiogroup']",
  "[role='switch']",
  "[role='tab']",
  "[contenteditable='true']",
  "[tabindex]",
  "[data-sidebar-interactive]",
].join(",");

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
  onNavigate,
  onRequestExpand,
  pathname,
}: {
  expanded: boolean;
  onNavigate?: () => void;
  onRequestExpand?: () => void;
  pathname: string;
}) => {
  const reduce = useReducedMotion();

  // Derive which accordion sections should be open from the pathname, so a
  // deep link (or a back/forward navigation) keeps the matching section open.
  const activeSectionIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const item of NAV_ITEMS) {
      if (!("children" in item)) continue;
      const matches = (href: string) =>
        pathname === href || pathname.startsWith(`${href}/`);
      if (item.children.some((child) => matches(child.href))) {
        ids.push(item.id);
      }
    }
    return new Set(ids);
  }, [pathname]);

  // Local open state — initialised from active sections, kept in sync when the
  // pathname changes. Each parent accordion item is its own Radix item keyed by
  // its id, surfaced through a single Radix "single collapsible" root.
  const [openSections, setOpenSections] = React.useState<Set<string>>(() =>
    new Set(activeSectionIds)
  );

  React.useEffect(() => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      activeSectionIds.forEach((id) => next.add(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSectionIds]);

  // Render a parent accordion item (has children).
  const renderAccordion = (item: Extract<NavItem, { children: NavChild[] }>) => {
    const sectionActive = activeSectionIds.has(item.id);
    const open = openSections.has(item.id);

    if (!expanded) {
      const shortcutButton = (
        <button
          type="button"
          aria-label={`باز کردن زیرمنوی ${item.label}`}
          onClick={() => {
            setOpenSections((prev) => {
              const next = new Set(prev);
              next.add(item.id);
              return next;
            });
            onNavigate?.();
            onRequestExpand?.();
          }}
          className={cn(
            "flex h-11 w-full items-center justify-center rounded-2xl px-0 text-sm transition-colors duration-300 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            sectionActive
              ? "bg-card/70 font-medium text-foreground"
              : "text-muted"
          )}
        >
          <item.icon className="size-[1.15rem] shrink-0" aria-hidden />
        </button>
      );

      return (
        <li key={item.id}>
          <Tooltip
            content={`باز کردن ${item.label}`}
            side="end"
            wrapperClassName="w-full"
          >
            {shortcutButton}
          </Tooltip>
        </li>
      );
    }

    return (
      <li key={item.id}>
        <AccordionPrimitive.Root
          type="multiple"
          value={Array.from(openSections)}
          onValueChange={(next) => setOpenSections(new Set(next))}
        >
          <AccordionPrimitive.Item value={item.id}>
            <AccordionPrimitive.Header>
              <AccordionPrimitive.Trigger
                className={cn(
                  "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm transition-colors duration-300 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  sectionActive
                    ? "bg-card/70 font-medium text-foreground"
                    : "text-muted"
                )}
              >
                <item.icon className="size-[1.15rem] shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
                <motion.span
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
                  className="ms-auto shrink-0"
                >
                  <ChevronDown className="size-4" aria-hidden />
                </motion.span>
              </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content asChild>
              <motion.div
                initial={
                  reduce ? { opacity: 1 } : { height: 0, opacity: 0 }
                }
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.24, ease: luxe }}
                className="overflow-hidden"
              >
                <ul className="space-y-1 pb-1 pt-1">
                  {item.children.map((child) => {
                    // "/dashboard/ai-assistance" is a child as well as the
                    // parent id, so we match it exactly (no trailing-slash
                    // fallback) to avoid double-highlighting deeper children.
                    const childActive =
                      pathname === child.href ||
                      (child.href !== "/dashboard/ai-assistance" &&
                        pathname.startsWith(`${child.href}/`));

                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={() => onNavigate?.()}
                          aria-current={childActive ? "page" : undefined}
                          className={cn(
                            "flex h-10 items-center gap-3 rounded-2xl pe-3 ps-10 text-sm transition-colors duration-300 hover:bg-card/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                            childActive
                              ? "font-medium text-accent"
                              : "text-muted"
                          )}
                        >
                          <child.icon
                            className="size-4 shrink-0"
                            aria-hidden
                          />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            </AccordionPrimitive.Content>
          </AccordionPrimitive.Item>
        </AccordionPrimitive.Root>
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
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          if ("children" in item) {
            return renderAccordion(item);
          }

          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              href={item.href}
              onClick={() => onNavigate?.()}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm transition-colors duration-300 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                !expanded && "justify-center px-0",
                active
                  ? "bg-card/70 font-medium text-foreground"
                  : "text-muted"
              )}
            >
              <item.icon className="size-[1.15rem] shrink-0" aria-hidden />
              {expanded && <span className="truncate">{item.label}</span>}
            </Link>
          );

          return (
            <li key={item.id}>
              {expanded ? (
                link
              ) : (
                <Tooltip
                  content={item.label}
                  side="end"
                  wrapperClassName="w-full"
                >
                  {link}
                </Tooltip>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
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
              <button
                type="button"
                onClick={onOpenSettings}
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

const MobileHeader = ({
  businessName,
  triggerRef,
}: {
  businessName: string;
  triggerRef: React.Ref<HTMLButtonElement>;
}) => {
  const displayName = businessName.trim() || "کسب‌وکار من";

  return (
    <header className="sticky top-0 z-40 grid h-16 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center border-b border-line bg-background/90 px-4 backdrop-blur-xl xl:hidden">
      <DialogPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="باز کردن منوی داشبورد"
          className="flex size-11 items-center justify-center rounded-2xl text-muted transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DialogPrimitive.Trigger>

      <span className="flex min-w-0 items-center justify-center gap-2.5 font-bold">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-glow">
          <Bot className="size-[1.1rem]" aria-hidden />
        </span>
        <span className="truncate">پشتیبان</span>
      </span>

      <span
        title={displayName}
        aria-hidden
        className="flex size-9 items-center justify-center justify-self-end rounded-full bg-accent/15 text-sm font-bold text-accent"
      >
        {displayName.charAt(0)}
      </span>
    </header>
  );
};

const MobileNavigationDrawer = ({
  accountTriggerRef,
  businessName,
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
  accountTriggerRef: React.RefObject<HTMLButtonElement>;
  businessName: string;
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
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-glow">
                    <Bot className="size-5" aria-hidden />
                  </span>
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
                pathname={pathname}
                onNavigate={onNavigate}
              />

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
  businessName,
  email,
  fullName,
}: {
  children: React.ReactNode;
  businessName: string;
  email: string;
  fullName: string;
}) => {
  // UI state stays local; session data comes from the Redux profile slice.
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [sidebarHovered, setSidebarHovered] = React.useState(false);
  const [desktopProfileMenuOpen, setDesktopProfileMenuOpen] =
    React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [mobileProfileMenuOpen, setMobileProfileMenuOpen] =
    React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] =
    React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [themeReady, setThemeReady] = React.useState(false);
  const [currentBusinessName, setCurrentBusinessName] =
    React.useState(businessName);
  const [currentFullName, setCurrentFullName] = React.useState(fullName);
  const desktopToggleRef = React.useRef<HTMLButtonElement>(null);
  const desktopAccountTriggerRef = React.useRef<HTMLButtonElement>(null);
  const mobileAccountTriggerRef = React.useRef<HTMLButtonElement>(null);
  const mobileMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const pageScrollRef = React.useRef<HTMLDivElement>(null);
  const profile = useSessionProfile();
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const { toast } = useToast();

  const ToggleIcon = sidebarOpen ? PanelRightClose : PanelRightOpen;
  const toggleLabel = sidebarOpen ? "بستن سایدبار" : "باز کردن سایدبار";

  const toggleSidebar = () => {
    setSidebarOpen((value) => !value);
    setDesktopProfileMenuOpen(false);
  };

  const handleDesktopSidebarClick = (
    event: React.MouseEvent<HTMLElement>
  ) => {
    if (event.defaultPrevented) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(SIDEBAR_INTERACTIVE_SELECTOR)) return;

    toggleSidebar();
  };

  const handleDesktopSidebarPointerMove = (
    event: React.PointerEvent<HTMLElement>
  ) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const showToggle =
      Boolean(target.closest("[data-sidebar-toggle]")) ||
      !target.closest(SIDEBAR_INTERACTIVE_SELECTOR);
    setSidebarHovered(showToggle);
  };

  const toggleDesktopProfileMenu = () => {
    if (!sidebarOpen) {
      setSidebarOpen(true);
      setDesktopProfileMenuOpen(true);
      return;
    }
    setDesktopProfileMenuOpen((value) => !value);
  };

  const openSettings = () => {
    const openedFromMobile = mobileNavOpen;
    setDesktopProfileMenuOpen(false);
    setMobileProfileMenuOpen(false);
    setMobileNavOpen(false);

    if (openedFromMobile) {
      window.requestAnimationFrame(() => setSettingsOpen(true));
      return;
    }
    setSettingsOpen(true);
  };

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
    setCurrentFullName(fullName);
  }, [businessName, fullName]);

  React.useEffect(() => setThemeReady(true), []);

  React.useEffect(() => {
    setMobileNavOpen(false);
    setMobileProfileMenuOpen(false);
    setDesktopProfileMenuOpen(false);
    pageScrollRef.current?.scrollTo({ top: 0 });
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
        onClick={handleDesktopSidebarClick}
        onPointerMove={handleDesktopSidebarPointerMove}
        onPointerLeave={() => setSidebarHovered(false)}
        animate={{ width: sidebarOpen ? OPEN_W : CLOSED_W }}
        transition={reduce ? { duration: 0 } : { duration: 0.45, ease: luxe }}
        className="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-visible border-e border-line bg-surface/60 p-4 xl:flex"
      >
        <Tooltip
          content={toggleLabel}
          side="end"
          delay={500}
          wrapperClassName="w-full"
        >
          <button
            ref={desktopToggleRef}
            type="button"
            data-sidebar-toggle
            aria-label={toggleLabel}
            aria-expanded={sidebarOpen}
            onClick={toggleSidebar}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-full text-start font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              !sidebarOpen && "justify-center"
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ease-luxe",
                sidebarHovered
                  ? "bg-card text-foreground"
                  : "bg-accent text-accent-foreground shadow-glow"
              )}
            >
              {sidebarHovered ? (
                <ToggleIcon className="size-5" aria-hidden />
              ) : (
                <Bot className="size-5" aria-hidden />
              )}
            </span>
            {sidebarOpen && <span>پشتیبان</span>}
          </button>
        </Tooltip>

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
            pathname={pathname}
            onNavigate={() => setDesktopProfileMenuOpen(false)}
            onRequestExpand={() => setSidebarOpen(true)}
          />

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
          <MobileHeader
            businessName={currentBusinessName}
            triggerRef={mobileMenuTriggerRef}
          />
          <MobileNavigationDrawer
            accountTriggerRef={mobileAccountTriggerRef}
            open={mobileNavOpen}
            pathname={pathname}
            profile={profile}
            businessName={currentBusinessName}
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

        <main className="min-h-[calc(100dvh-4rem)] min-w-0 p-4 sm:p-6 md:p-8 xl:min-h-dvh xl:p-10">
          {children}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        fullName={currentFullName}
        businessName={currentBusinessName}
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
