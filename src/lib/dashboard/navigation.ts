import {
  BarChart3,
  BookOpen,
  FileText,
  GitBranch,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  MessageSquareText,
  Send,
  SlidersHorizontal,
  Sparkles,
  Store,
  ToggleRight,
  Users,
  Wand2,
  Workflow,
} from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import type { AppIcon } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// The dashboard's routes, declared once. Three consumers read this module: the
// sidebar rail (components/dashboard/shell), the top bar's breadcrumb and the
// command palette's "go to" group (components/dashboard/top-bar). Keeping the
// list here is what stops the same route from being spelled out three times.
// ---------------------------------------------------------------------------

export type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: AppIcon;
};

export type NavGroup = {
  id: string;
  /** Small section heading shown above the group when the sidebar is expanded. */
  label?: string;
  items: NavItem[];
};

// Hrefs that are also the parent of deeper routes — matched exactly so a child
// route does not light up its parent as well.
export const EXACT_MATCH_HREFS = new Set(["/dashboard/admin"]);

// Ordered to mirror the journey of a customer message: it arrives on a channel,
// meets the automation rules, falls through to the assistant, which answers
// from the knowledge base. The sidebar is the only place that teaches this.
// Channels are grouped under a heading so a second and third one read as more
// of the same thing rather than as unrelated destinations.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    items: [
      {
        id: "overview",
        href: "/dashboard/overview",
        label: "نمای کلی",
        icon: LayoutDashboard,
      },
      { id: "inbox", href: "/dashboard/inbox", label: "گفتگوها", icon: Inbox },
    ],
  },
  {
    id: "channels",
    label: "کانال‌ها",
    items: [
      { id: "bot", href: "/dashboard/bot", label: "ربات تلگرام", icon: Send },
      {
        id: "instagram",
        href: "/dashboard/instagram",
        label: "اینستاگرام",
        icon: TbBrandInstagram,
      },
    ],
  },
  {
    id: "build",
    items: [
      {
        id: "automation",
        href: "/dashboard/automation",
        label: "اتوماسیون",
        icon: Workflow,
      },
      {
        id: "assistant",
        href: "/dashboard/assistant",
        label: "دستیار",
        icon: Sparkles,
      },
      {
        id: "knowledge",
        href: "/dashboard/knowledge",
        label: "دانش دستیار",
        icon: BookOpen,
      },
    ],
  },
];

// Appended to NAV_GROUPS only for site admins (profiles.is_admin).
export const ADMIN_NAV_GROUP: NavGroup = {
  id: "administration",
  label: "مدیریت",
  items: [
    {
      id: "admin-usage",
      href: "/dashboard/admin",
      label: "مصرف و آمار",
      icon: BarChart3,
    },
    {
      id: "admin-businesses",
      href: "/dashboard/admin/businesses",
      label: "کسب‌وکارها",
      icon: Store,
    },
    {
      id: "admin-settings",
      href: "/dashboard/admin/settings",
      label: "تنظیمات هوش مصنوعی",
      icon: SlidersHorizontal,
    },
  ],
};

export type RouteSection = { label: string; href: string };

export type DashboardRoute = {
  href: string;
  /**
   * The page's own h1, verbatim — the bar shows this once the heading scrolls
   * away, so anything else makes the bar contradict the page it is labelling.
   * Sidebar and tab labels are free to be shorter; this one is not.
   */
  title: string;
  /** Parent section, omitted when the page is a section in its own right. */
  section?: RouteSection;
  icon: AppIcon;
  /** Extra terms the command palette should match on beyond the title. */
  keywords?: string[];
  adminOnly?: boolean;
  /**
   * Resolve breadcrumbs for this path, but never offer it as a destination —
   * for prefixes like /dashboard/flow that only exist with an id appended.
   */
  unlisted?: boolean;
};

const BOT: RouteSection = { label: "ربات تلگرام", href: "/dashboard/bot" };
const AUTOMATION: RouteSection = {
  label: "اتوماسیون",
  href: "/dashboard/automation",
};
const ASSISTANT: RouteSection = {
  label: "دستیار",
  href: "/dashboard/assistant",
};
const KNOWLEDGE: RouteSection = {
  label: "دانش دستیار",
  href: "/dashboard/knowledge",
};
const ADMIN: RouteSection = { label: "مدیریت", href: "/dashboard/admin" };

/**
 * Every destination in the dashboard, tab children included — the sidebar only
 * lists section roots, but a search that cannot reach «پرسش و پاسخ» directly is
 * not worth opening.
 */
export const DASHBOARD_ROUTES: DashboardRoute[] = [
  {
    href: "/dashboard/overview",
    title: "نمای کلی",
    icon: LayoutDashboard,
    keywords: ["داشبورد", "خانه", "آمار", "مصرف", "overview", "home"],
  },
  {
    href: "/dashboard/inbox",
    title: "صندوق پیام‌ها",
    icon: Inbox,
    keywords: [
      "گفتگو",
      "صندوق",
      "پیام",
      "مشتری",
      "پشتیبانی",
      "ارجاع",
      "inbox",
      "chat",
    ],
  },

  {
    href: "/dashboard/bot",
    title: "اتصال و وضعیت",
    section: BOT,
    icon: Link2,
    keywords: ["تلگرام", "توکن", "اتصال", "ربات", "telegram", "bot"],
  },
  {
    href: "/dashboard/bot/admins",
    title: "ادمین‌ها و ارجاع",
    section: BOT,
    icon: Users,
    keywords: ["ادمین", "اپراتور", "handoff", "admin"],
  },
  {
    href: "/dashboard/bot/menu",
    title: "منوی ربات",
    section: BOT,
    icon: LayoutGrid,
    keywords: ["دکمه", "کیبورد", "منو", "menu", "keyboard"],
  },

  {
    href: "/dashboard/instagram",
    title: "اتصال اینستاگرام",
    icon: TbBrandInstagram,
    keywords: [
      "اینستاگرام",
      "دایرکت",
      "حساب تجاری",
      "اتصال",
      "instagram",
      "direct",
    ],
  },
  {
    href: "/dashboard/instagram/menu",
    title: "منوی دایرکت",
    icon: TbBrandInstagram,
    keywords: [
      "اینستاگرام",
      "دایرکت",
      "منو",
      "ice breaker",
      "persistent menu",
      "instagram",
      "direct",
    ],
  },

  {
    href: "/dashboard/automation",
    title: "فلوها",
    section: AUTOMATION,
    icon: GitBranch,
    keywords: ["فلو", "سناریو", "مسیر", "flow"],
  },
  {
    href: "/dashboard/automation/keywords",
    title: "پیام‌های آماده",
    section: AUTOMATION,
    icon: MessageSquareText,
    // The tab strip calls this «کلیدواژه‌ها و فرمان‌ها» while the page's own
    // heading says «پیام‌های آماده»; the bar follows the heading, and the tab's
    // wording stays searchable through these.
    keywords: ["کلیدواژه", "فرمان", "پیام آماده", "keyword", "command"],
  },

  {
    // Never navigable on its own — a flow id always follows. Listed so the bar
    // can still say «اتوماسیون ›» while the builder supplies the flow's name.
    href: "/dashboard/flow",
    title: "ویرایش فلو",
    section: AUTOMATION,
    icon: GitBranch,
    unlisted: true,
  },

  {
    href: "/dashboard/assistant",
    title: "وضعیت و رفتار",
    section: ASSISTANT,
    icon: ToggleRight,
    keywords: ["هوش مصنوعی", "روشن", "خاموش", "پیش‌نمایش", "ai", "preview"],
  },
  {
    href: "/dashboard/assistant/persona",
    title: "شخصیت و لحن دستیار",
    section: ASSISTANT,
    icon: Wand2,
    keywords: ["پرسونا", "لحن", "معرفی", "دستورالعمل", "persona", "tone"],
  },

  {
    href: "/dashboard/knowledge",
    title: "اطلاعات کسب‌وکار",
    section: KNOWLEDGE,
    icon: BookOpen,
    keywords: ["دانش", "فکت", "نکته", "facts"],
  },
  {
    href: "/dashboard/knowledge/qa",
    title: "پرسش و پاسخ آماده",
    section: KNOWLEDGE,
    icon: HelpCircle,
    keywords: ["سوال", "جواب", "qa", "faq"],
  },
  {
    href: "/dashboard/knowledge/sources",
    title: "فایل‌ها و لینک‌ها",
    section: KNOWLEDGE,
    icon: FileText,
    keywords: ["منبع", "فایل", "لینک", "آدرس", "source", "url"],
  },

  {
    href: "/dashboard/admin",
    title: "مصرف و آمار",
    section: ADMIN,
    icon: BarChart3,
    keywords: ["توکن", "نمودار", "usage"],
    adminOnly: true,
  },
  {
    href: "/dashboard/admin/businesses",
    title: "کسب‌وکارها",
    section: ADMIN,
    icon: Store,
    keywords: ["کاربر", "حساب", "سقف", "businesses"],
    adminOnly: true,
  },
  {
    href: "/dashboard/admin/settings",
    title: "تنظیمات هوش مصنوعی",
    section: ADMIN,
    icon: SlidersHorizontal,
    keywords: ["آستانه", "مدل", "کلید", "global", "threshold"],
    adminOnly: true,
  },
];

/**
 * The route a pathname is on, by longest matching href. A section's first page
 * sits on the parent path (/dashboard/knowledge) while its siblings nest under
 * it (/dashboard/knowledge/qa), so a plain prefix test would match both — the
 * longest match is always the more specific one. Same rule as findActiveHref in
 * components/ui/page-tabs.
 */
export const resolveRoute = (pathname: string): DashboardRoute | null => {
  let match: DashboardRoute | null = null;

  for (const route of DASHBOARD_ROUTES) {
    const matches =
      pathname === route.href ||
      (!EXACT_MATCH_HREFS.has(route.href) &&
        pathname.startsWith(`${route.href}/`));
    if (!matches) continue;
    if (match === null || route.href.length > match.href.length) match = route;
  }

  return match;
};
