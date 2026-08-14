"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  Headset,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon, type AppIcon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useInboxCount } from "@/store/use-inbox-count";
import { cn, fa, normalizeFa } from "@/lib/utils";

type Conversation = {
  id: string;
  channel: "telegram" | "instagram";
  customerDisplayName: string | null;
  customerUsername: string | null;
  lastCustomerMessageText: string | null;
  lastCustomerMessageAt: string | null;
  status: "open" | "answered" | "closed" | "dismissed";
  queuedReason: "ai_unknown" | "customer_request" | "ai_disabled" | "frustration";
  createdAt: string;
};

type Message = {
  id: string;
  role: "customer" | "owner" | "assistant" | "system";
  content: string;
  created_at: string;
  /** Set on the optimistic bubble while the channel round-trip is in flight. */
  pending?: boolean;
};

type InboxPanelProps = {
  initialConversations: Conversation[];
  setupRequired: boolean;
};

type StatusFilter = "open" | "answered" | "all";

const REASON_LABELS: Record<string, string> = {
  ai_unknown: "هوش مصنوعی نتوانست پاسخ دهد",
  customer_request: "مشتری درخواست پشتیبان کرد",
  ai_disabled: "دستیار خاموش است",
  frustration: "تکرار سوال بدون پاسخ",
};

const STATUS_LABELS: Record<string, string> = {
  open: "باز",
  answered: "پاسخ داده شد",
  closed: "بسته شد",
  dismissed: "نادیده گرفته شد",
};

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "open", label: "نیازمند پاسخ" },
  { id: "answered", label: "پاسخ‌داده‌شده" },
  { id: "all", label: "همه گفتگوها" },
];

/**
 * Everything that differs between channels, in one place: the transcript
 * header, the list avatars and the composer footnote all read from here, so a
 * third channel is one entry rather than a hunt for `t.me` strings.
 */
const CHANNELS: Record<
  Conversation["channel"],
  {
    label: string;
    icon: AppIcon;
    profileUrl: (username: string) => string;
    delivery: string;
  }
> = {
  telegram: {
    label: "تلگرام",
    icon: Send,
    profileUrl: (username) => `https://t.me/${username}`,
    delivery: "پاسخ شما با ربات تلگرام برای مشتری ارسال می‌شود.",
  },
  instagram: {
    label: "اینستاگرام",
    icon: TbBrandInstagram,
    profileUrl: (username) => `https://instagram.com/${username}`,
    delivery: "پاسخ شما در دایرکت اینستاگرام برای مشتری ارسال می‌شود.",
  },
};

const ROLE_ICONS: Record<"customer" | "owner" | "assistant", AppIcon> = {
  customer: UserRound,
  owner: Headset,
  assistant: Bot,
};

/** Mirrors the server's own guard in `POST /api/inbox`. */
const REPLY_MAX_CHARS = 4000;
/** The counter stays out of the way until the limit is actually in reach. */
const COUNTER_VISIBLE_FROM = 3600;

/** Calendar-day identity, so messages can be grouped without formatting. */
const dayKey = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

/** Separator label between days: the two recent ones get words, not dates. */
const formatDay = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "امروز";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "دیروز";
  try {
    return date.toLocaleDateString("fa-IR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return "";
  }
};

/** List rows only need "when": the clock for today, the date for older. */
const formatStamp = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (dayKey(iso) === dayKey(new Date().toISOString())) return formatTime(iso);
  try {
    return date.toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
};

const customerLabel = (conv: Conversation): string =>
  conv.customerDisplayName ??
  (conv.customerUsername ? `@${conv.customerUsername}` : "مشتری");

export const InboxPanel = ({
  initialConversations,
  setupRequired,
}: InboxPanelProps) => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const { refresh: refreshInboxCount } = useInboxCount();
  const [conversations, setConversations] =
    React.useState<Conversation[]>(initialConversations);
  const [loading, setLoading] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("open");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  // Below `lg` the two panes share the frame, so only one is on screen at a
  // time — the list is the master view and a tap opens the detail view.
  const [mobileView, setMobileView] = React.useState<"list" | "chat">("list");

  const endRef = React.useRef<HTMLDivElement | null>(null);
  const replyRef = React.useRef<HTMLTextAreaElement | null>(null);
  // Which thread the transcript has already been pinned to the bottom for: the
  // first paint of a thread must jump, later messages should glide.
  const scrolledFor = React.useRef<string | null>(null);
  // Read inside async handlers to make sure a late response never lands in the
  // conversation the operator has since moved on to.
  const selectedIdRef = React.useRef<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox?status=${statusFilter}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { conversations?: Conversation[] };
      if (!res.ok) throw new Error("بارگذاری گفتگوها ناموفق بود.");
      if (data.conversations) setConversations(data.conversations);
    } catch (error) {
      toast({
        title: "بارگذاری صندوق ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMessages = React.useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/inbox/${conversationId}`);
      const data = (await res.json()) as {
        conversation?: Conversation;
        messages?: Message[];
      };
      if (!res.ok) throw new Error("بارگذاری پیام‌ها ناموفق بود.");
      // A slow transcript must not overwrite the one now on screen.
      if (selectedIdRef.current !== conversationId) return;
      if (data.messages) setMessages(data.messages);
    } catch {
      if (selectedIdRef.current !== conversationId) return;
      toast({
        title: "بارگذاری گفتگو ناموفق بود",
        description: "دوباره گفتگو را انتخاب کنید.",
        variant: "error",
      });
    } finally {
      if (selectedIdRef.current === conversationId) setMessagesLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    selectedIdRef.current = selectedId;
    if (selectedId) void loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  // Newest message in view. Switching threads jumps; an arriving message glides.
  React.useEffect(() => {
    const node = endRef.current;
    if (!node || !selectedId || messagesLoading) return;
    const firstPaint = scrolledFor.current !== selectedId;
    scrolledFor.current = selectedId;
    node.scrollIntoView({
      behavior: firstPaint || reduce ? "auto" : "smooth",
      block: "nearest",
    });
  }, [messages, messagesLoading, selectedId, reduce]);

  const handleSend = async () => {
    const text = replyText.trim();
    const conversationId = selectedId;
    if (!conversationId || !text || sending) return;
    // The bubble appears before the network does: the channel round-trip takes
    // a second or two, and an empty transcript that long reads as a failure.
    const pendingId = `pending-${crypto.randomUUID()}`;
    setSending(true);
    setReplyText("");
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        role: "owner",
        content: text,
        created_at: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "ارسال ناموفق بود.");
      }
      if (selectedIdRef.current === conversationId) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId ? { ...message, pending: false } : message
          )
        );
      }
      // The row is marked answered but stays where it is, even under the
      // "نیازمند پاسخ" filter: pulling it out mid-reply used to drop the
      // operator into the next customer's thread. The next refresh clears it.
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, status: "answered" }
            : conversation
        )
      );
      // One fewer conversation waiting — keep the top bar's badge honest.
      void refreshInboxCount();
      toast({ title: "پاسخ ارسال شد", variant: "success" });
    } catch (error) {
      if (selectedIdRef.current === conversationId) {
        setMessages((prev) => prev.filter((message) => message.id !== pendingId));
        // Give the text back — unless the operator already started retyping.
        setReplyText((current) => (current ? current : text));
      }
      toast({
        title: "ارسال ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSending(false);
      replyRef.current?.focus();
    }
  };

  const handleClose = async (conversationId: string) => {
    try {
      const res = await fetch("/api/inbox", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error();
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (selectedId === conversationId) {
        setSelectedId(null);
        setMobileView("list");
      }
      // Closing a conversation also changes the open count — refresh the badge.
      void refreshInboxCount();
      toast({ title: "گفتگو بسته شد", variant: "success" });
    } catch {
      toast({ title: "بستن گفتگو ناموفق بود", variant: "error" });
    }
  };

  const filteredConversations = React.useMemo(() => {
    // normalizeFa, not toLocaleLowerCase: it folds ي/ی, ك/ک and Persian digits,
    // so «۱۲۳» and "123" — and a name typed with an Arabic yeh — still match.
    const query = normalizeFa(search);
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const haystack = normalizeFa(
        [
          customerLabel(conversation),
          conversation.customerUsername ?? "",
          conversation.lastCustomerMessageText ?? "",
          CHANNELS[conversation.channel]?.label ?? "",
          REASON_LABELS[conversation.queuedReason] ?? conversation.queuedReason,
        ].join(" ")
      );
      return haystack.includes(query);
    });
  }, [conversations, search]);

  React.useEffect(() => {
    if (!filteredConversations.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && filteredConversations.some((conversation) => conversation.id === current)
        ? current
        : filteredConversations[0].id
    );
  }, [filteredConversations]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const showChat = mobileView === "chat" && !!selected;
  const replyLength = replyText.length;
  // Grouping happens once per transcript so the day separators stay in the
  // render as a flat map instead of a lookahead on every message.
  const messageDays = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; items: Message[] }> = [];
    for (const message of messages) {
      const key = dayKey(message.created_at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(message);
      else groups.push({ key, label: formatDay(message.created_at), items: [message] });
    }
    return groups;
  }, [messages]);

  const openConversation = (conversationId: string) => {
    setSelectedId(conversationId);
    setMobileView("chat");
  };

  // Who is speaking has to be readable at a glance: the customer sits on the
  // start side, everything the business said (the assistant and the operator)
  // on the end side, and the handover notes run down the middle as plain notes.
  const renderMessage = (msg: Message) => {
    const common = {
      initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: reduce ? 0 : 0.2, ease: luxe },
    } as const;

    if (msg.role === "system") {
      return (
        <motion.div key={msg.id} {...common} className="flex justify-center">
          <p className="max-w-[85%] rounded-full border border-line bg-background/40 px-3.5 py-1.5 text-center text-[11px] leading-6 text-muted">
            {msg.content}
          </p>
        </motion.div>
      );
    }

    const fromBusiness = msg.role === "owner" || msg.role === "assistant";
    const RoleIcon = ROLE_ICONS[msg.role];
    return (
      <motion.div
        key={msg.id}
        {...common}
        className={cn("flex items-end gap-2.5", fromBusiness && "flex-row-reverse")}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border",
            msg.role === "owner"
              ? "border-accent/25 bg-accent/12 text-accent"
              : "border-line bg-card text-muted"
          )}
        >
          <RoleIcon className="size-4" aria-hidden />
        </span>
        <div
          className={cn(
            "min-w-0 max-w-[min(85%,34rem)] rounded-2xl border px-4 py-3",
            msg.role === "customer" && "rounded-es-md border-line bg-surface",
            msg.role === "owner" && "rounded-ee-md border-accent/20 bg-accent/10",
            msg.role === "assistant" && "rounded-ee-md border-line bg-card/70",
            msg.pending && "opacity-70"
          )}
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{msg.content}</p>
          <p className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-muted">
            {msg.role === "assistant" && <span>دستیار</span>}
            <span className="tabular-nums">{formatTime(msg.created_at)}</span>
            {msg.role === "owner" &&
              (msg.pending ? (
                <>
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  <span className="sr-only">در حال ارسال</span>
                </>
              ) : (
                <>
                  <Check className="size-3 text-accent" aria-hidden />
                  <span className="sr-only">ارسال شد</span>
                </>
              ))}
          </p>
        </div>
      </motion.div>
    );
  };

  return (
    // The frame is pinned to the viewport, not to the transcript: 3.5rem of top
    // bar plus the `main` padding at each breakpoint (p-4 / 6 / 8 / 10). Every
    // scroll from here down happens inside the panes, so neither a long chat
    // nor a growing composer can change the height of the page.
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col",
        "h-[calc(100dvh-5.5rem)] sm:h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh-7.5rem)] xl:h-[calc(100dvh-8.5rem)]",
        "min-h-[34rem]"
      )}
    >
      <header className="mb-5 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black">صندوق پیام‌ها</h1>
            <Badge variant="accent" dot>
              {fa(filteredConversations.length)} گفتگو
            </Badge>
          </div>
          <p className="mt-2 hidden max-w-2xl text-sm leading-7 text-muted sm:block">
            پیام‌هایی که دستیار برای پاسخ‌گویی به شما سپرده است؛ گفتگو را باز کنید، پاسخ دهید و بعد ببندید.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
          startIcon={
            loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )
          }
          className="self-start"
        >
          تازه‌سازی
        </Button>
      </header>

      {setupRequired && (
        <Alert
          variant="warning"
          className="mb-5 shrink-0"
          title="راه‌اندازی صندوق کامل نشده"
          description="اسکریپت inbox.sql را در Supabase SQL Editor اجرا کنید تا گفتگوهای واقعی اینجا نمایش داده شوند."
        />
      )}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-surface/30 shadow-soft">
        <div className="flex shrink-0 flex-col gap-4 border-b border-line bg-surface/45 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-background/45 p-1" role="tablist" aria-label="فیلتر گفتگوها">
            {FILTERS.map((filter) => {
              const active = statusFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(filter.id)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                    active
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
          {/* The refresh button already owns the loading state; a second
              spinner beside the field only made the toolbar twitch. */}
          <div className="min-w-0 sm:w-72">
            <Input
              aria-label="جستجو در گفتگوها"
              placeholder="جستجوی نام یا متن پیام"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              startIcon={<Search />}
              className="min-w-0"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside
            className={cn(
              "flex min-h-0 flex-1 flex-col border-line lg:w-[21rem] lg:flex-none lg:border-e",
              showChat && "hidden lg:flex"
            )}
            aria-label="فهرست گفتگوها"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
              <p className="text-xs font-bold">گفتگوها</p>
              <span className="text-xs text-muted">{fa(filteredConversations.length)} مورد</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {filteredConversations.length === 0 ? (
                <div className="flex h-full min-h-64 flex-col items-center justify-center px-5 text-center text-muted">
                  <Icon icon={Inbox} tile size="lg" tone="muted" />
                  <p className="mt-4 text-sm font-medium">
                    {search.trim() ? "گفتگویی با این جستجو پیدا نشد" : "گفتگوی دیگری در این بخش نیست"}
                  </p>
                  <p className="mt-1.5 text-xs leading-6">
                    {search.trim() ? "نام مشتری یا بخشی از پیام را کوتاه‌تر جستجو کنید." : "وقتی مشتری به کمک انسانی نیاز داشته باشد، گفتگو اینجا می‌آید."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {filteredConversations.map((conv) => {
                    const ChannelIcon = CHANNELS[conv.channel]?.icon ?? Send;
                    const active = selectedId === conv.id;
                    return (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(conv.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                          active
                            ? "border-accent/35 bg-accent/10"
                            : "border-transparent hover:bg-surface/60"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="relative shrink-0">
                            <span className={cn(
                              "flex size-9 items-center justify-center rounded-xl text-sm font-bold",
                              conv.status === "open" ? "bg-accent/15 text-accent" : "bg-card text-muted"
                            )}>
                              {customerLabel(conv).charAt(0)}
                            </span>
                            {/* Which channel the customer wrote from, on the
                                avatar rather than as another row of text. */}
                            <span
                              className="absolute -bottom-1 -start-1 flex size-4 items-center justify-center rounded-full border border-line bg-surface text-muted"
                              title={CHANNELS[conv.channel]?.label}
                            >
                              <ChannelIcon className="size-2.5" aria-hidden />
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-bold">{customerLabel(conv)}</span>
                              <span className="shrink-0 text-[10px] tabular-nums text-muted">{formatStamp(conv.lastCustomerMessageAt)}</span>
                            </span>
                            <span className="mt-1 flex items-center gap-2">
                              <Badge
                                variant={conv.status === "open" ? "accent" : "muted"}
                                className="px-2 py-0.5 text-[10px]"
                              >
                                {STATUS_LABELS[conv.status] ?? conv.status}
                              </Badge>
                              <span className="truncate text-[10px] text-muted">
                                {REASON_LABELS[conv.queuedReason] ?? conv.queuedReason}
                              </span>
                            </span>
                            <span className="mt-2 block truncate text-xs text-muted">
                              {conv.lastCustomerMessageText ?? "(بدون متن)"}
                            </span>
                          </span>
                        </div>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <section
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col bg-background/20",
              !showChat && "hidden lg:flex"
            )}
            aria-label="متن گفتگو"
          >
            {!selected ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted">
                <Icon icon={MessageSquare} tile size="xl" tone="muted" />
                <p className="mt-5 text-sm font-medium">یک گفتگو را انتخاب کنید</p>
                <p className="mt-1.5 max-w-sm text-xs leading-6">
                  از فهرست گفتگوها یک مورد را باز کنید تا سابقه پیام‌ها و پاسخ‌گویی در دسترس باشد.
                </p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line p-3 sm:p-4">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setMobileView("list")}
                      aria-label="بازگشت به فهرست گفتگوها"
                      className="shrink-0 lg:hidden"
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                    <Icon
                      icon={CHANNELS[selected.channel]?.icon ?? Send}
                      tile
                      size="sm"
                      tone="accent"
                      className="hidden shrink-0 sm:inline-flex"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{customerLabel(selected)}</p>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                        <span className="shrink-0">{CHANNELS[selected.channel]?.label ?? "گفتگو"}</span>
                        {selected.customerUsername && (
                          <>
                            <span aria-hidden>·</span>
                            <a
                              href={CHANNELS[selected.channel]?.profileUrl(selected.customerUsername)}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-accent hover:underline"
                            >
                              @{selected.customerUsername}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={selected.status === "open" ? "accent" : "muted"} className="hidden text-[10px] sm:inline-flex">
                      {STATUS_LABELS[selected.status] ?? selected.status}
                    </Badge>
                    {/* A bare ✕ read as "close this panel". The tick plus a
                        word says what it does: the conversation is done. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleClose(selected.id)}
                      startIcon={<CheckCheck className="size-4" aria-hidden />}
                      aria-label="بستن گفتگو"
                      title="بستن گفتگو"
                      className="shrink-0 text-muted hover:text-foreground"
                    >
                      <span className="hidden sm:inline">بستن گفتگو</span>
                    </Button>
                  </div>
                </header>

                <div
                  role="log"
                  aria-label="پیام‌های گفتگو"
                  aria-busy={messagesLoading || undefined}
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5"
                >
                  {messagesLoading && (
                    <div className="space-y-4" role="status" aria-label="در حال بارگذاری پیام‌ها">
                      {[0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className={cn("flex items-end gap-2.5", index === 1 && "flex-row-reverse")}
                        >
                          <Skeleton className="size-8 shrink-0 rounded-full" />
                          <Skeleton
                            className={cn("rounded-2xl", index === 1 ? "h-12 w-1/2" : "h-16 w-2/3")}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {!messagesLoading && messages.length === 0 && (
                    <p className="py-10 text-center text-xs text-muted">هنوز پیامی در این گفتگو ثبت نشده است.</p>
                  )}
                  {!messagesLoading &&
                    messageDays.map((day) => (
                      <div key={day.key} className="space-y-3">
                        {/* Telegram-style day marker: it sticks while its own
                            day scrolls past, so "when" is always answered. */}
                        <div className="sticky top-0 z-10 flex justify-center">
                          <span className="rounded-full border border-line bg-background/85 px-3 py-1 text-[10px] font-medium text-muted backdrop-blur">
                            {day.label}
                          </span>
                        </div>
                        <AnimatePresence initial={false}>
                          {day.items.map((msg) => renderMessage(msg))}
                        </AnimatePresence>
                      </div>
                    ))}
                  {/* Scroll anchor — see the auto-scroll effect above. */}
                  <div ref={endRef} aria-hidden className="h-px" />
                </div>

                {/* One card, one focus ring: the field, the shortcut hint, the
                    counter and the send button read as a single control the way
                    Notion's and Intercom's composers do — instead of a boxed
                    textarea with a floating circle bolted to its side. */}
                <div className="shrink-0 border-t border-line bg-surface/40 p-3 sm:p-4">
                  <div className="rounded-3xl border border-line bg-card/60 transition-colors duration-300 ease-luxe focus-within:border-accent/60 focus-within:bg-card">
                    <Textarea
                      ref={replyRef}
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        // Shift/Alt + Enter is a newline, and an IME closes its
                        // candidate window with an Enter that must not send.
                        if (event.shiftKey || event.altKey) return;
                        if (event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        void handleSend();
                      }}
                      placeholder="پاسخ خود را بنویسید…"
                      aria-label="متن پاسخ"
                      autoResize
                      rows={2}
                      maxLength={REPLY_MAX_CHARS}
                      className="min-h-[8rem] max-h-[14rem] rounded-3xl border-transparent bg-transparent px-4 py-3.5 focus:border-transparent focus:bg-transparent"
                    />
                    <div className="flex items-center justify-between gap-3 px-3 pb-3">
                      <p className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
                        <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px]">Enter</kbd>
                        ارسال
                        <span aria-hidden className="text-muted/60">·</span>
                        <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px]">Shift</kbd>
                        +
                        <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px]">Enter</kbd>
                        خط تازه
                      </p>
                      <div className="flex items-center gap-2 sm:ms-auto">
                        {replyLength >= COUNTER_VISIBLE_FROM && (
                          <span
                            className={cn(
                              "text-[11px] tabular-nums",
                              replyLength >= REPLY_MAX_CHARS ? "text-danger" : "text-muted"
                            )}
                          >
                            {fa(replyLength)} / {fa(REPLY_MAX_CHARS)}
                          </span>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          loading={sending}
                          disabled={!replyText.trim()}
                          onClick={() => void handleSend()}
                          aria-label="ارسال پاسخ"
                          title="ارسال پاسخ"
                          // A spinner at 50% opacity read as "broken", not
                          // "busy": while sending, the button keeps its weight.
                          className={sending ? "disabled:opacity-100" : undefined}
                        >
                          <Send className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 px-1 text-[11px] leading-6 text-muted">
                    {CHANNELS[selected.channel]?.delivery ?? "پاسخ شما برای مشتری ارسال می‌شود."}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
};
