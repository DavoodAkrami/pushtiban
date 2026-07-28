"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Inbox,
  Loader2,
  Search,
  Send,
  X,
  CheckCircle2,
  XCircle,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";

type Conversation = {
  id: string;
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

const formatDate = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fa-IR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
      if (data.messages) setMessages(data.messages);
    } catch {
      toast({
        title: "بارگذاری گفتگو ناموفق بود",
        description: "دوباره گفتگو را انتخاب کنید.",
        variant: "error",
      });
    } finally {
      setMessagesLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (selectedId) void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  const handleSend = async () => {
    if (!selectedId || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, text: replyText.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "ارسال ناموفق بود.");
      }
      // Optimistic: add the reply to the transcript.
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "owner",
          content: replyText.trim(),
          created_at: new Date().toISOString(),
        },
      ]);
      setReplyText("");
      // Mark the conversation as answered in the list view.
      setConversations((prev) => {
        if (statusFilter === "open") {
          return prev.filter((conversation) => conversation.id !== selectedId);
        }
        return prev.map((conversation) =>
          conversation.id === selectedId
            ? { ...conversation, status: "answered" }
            : conversation
        );
      });
      if (statusFilter === "open") setSelectedId(null);
      toast({ title: "پاسخ ارسال شد", variant: "success" });
    } catch (error) {
      toast({
        title: "ارسال ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSending(false);
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
      if (selectedId === conversationId) setSelectedId(null);
      toast({ title: "گفتگو بسته شد", variant: "success" });
    } catch {
      toast({ title: "بستن گفتگو ناموفق بود", variant: "error" });
    }
  };

  const filteredConversations = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fa-IR");
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const haystack = [
        customerLabel(conversation),
        conversation.customerUsername ?? "",
        conversation.lastCustomerMessageText ?? "",
        REASON_LABELS[conversation.queuedReason] ?? conversation.queuedReason,
      ]
        .join(" ")
        .toLocaleLowerCase("fa-IR");
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
  const currentFilterLabel =
    FILTERS.find((filter) => filter.id === statusFilter)?.label ?? "گفتگو";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black">صندوق پیام‌ها</h1>
            <Badge variant="accent" dot>
              {fa(conversations.length)} {currentFilterLabel}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
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
          className="mb-5"
          title="راه‌اندازی صندوق کامل نشده"
          description="اسکریپت inbox.sql را در Supabase SQL Editor اجرا کنید تا گفتگوهای واقعی اینجا نمایش داده شوند."
        />
      )}

      <section className="overflow-hidden rounded-3xl border border-line bg-surface/30 shadow-soft">
        <div className="flex flex-col gap-4 border-b border-line bg-surface/45 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
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
          <div className="flex min-w-0 items-center gap-2 sm:w-72">
            <Input
              aria-label="جستجو در گفتگوها"
              placeholder="جستجوی نام یا متن پیام"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              startIcon={<Search />}
              className="min-w-0"
            />
            {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />}
          </div>
        </div>

        <div className="grid min-h-[32rem] grid-cols-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <aside className="border-b border-line lg:border-b-0 lg:border-e" aria-label="فهرست گفتگوها">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-xs font-bold">گفتگوها</p>
              <span className="text-xs text-muted">{fa(filteredConversations.length)} مورد</span>
            </div>
            <div className="max-h-[min(32rem,calc(100dvh-17rem))] overflow-y-auto p-2">
              {filteredConversations.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center text-muted">
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
                  {filteredConversations.map((conv) => (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(conv.id)}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                          selectedId === conv.id
                            ? "border-accent/35 bg-accent/10"
                            : "border-transparent hover:bg-surface/60"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                            conv.status === "open" ? "bg-accent/15 text-accent" : "bg-card text-muted"
                          )}>
                            {customerLabel(conv).charAt(0)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-bold">{customerLabel(conv)}</span>
                              <span className="shrink-0 text-[10px] text-muted">{formatDate(conv.lastCustomerMessageAt)}</span>
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
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <section className="min-w-0 bg-background/20" aria-label="متن گفتگو">
            {!selected ? (
              <div className="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center text-muted">
                <Icon icon={MessageSquare} tile size="xl" tone="muted" />
                <p className="mt-5 text-sm font-medium">یک گفتگو را انتخاب کنید</p>
                <p className="mt-1.5 max-w-sm text-xs leading-6">
                  از فهرست گفتگوها یک مورد را باز کنید تا سابقه پیام‌ها و پاسخ‌گویی در دسترس باشد.
                </p>
              </div>
            ) : (
              <div className="flex min-h-[32rem] max-h-[min(42rem,calc(100dvh-13rem))] flex-col">
                <header className="flex items-start justify-between gap-4 border-b border-line p-4 sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon icon={MessageSquare} tile size="sm" tone="accent" className="shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{customerLabel(selected)}</p>
                      {selected.customerUsername ? (
                        <a
                          href={`https://t.me/${selected.customerUsername}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-xs text-accent hover:underline"
                        >
                          @{selected.customerUsername}
                        </a>
                      ) : (
                        <p className="mt-1 text-xs text-muted">گفتگوی تلگرام</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={selected.status === "open" ? "accent" : "muted"} className="hidden text-[10px] sm:inline-flex">
                      {STATUS_LABELS[selected.status] ?? selected.status}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleClose(selected.id)}
                      aria-label="بستن گفتگو"
                      title="بستن گفتگو"
                      className="hover:text-danger"
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                  {messagesLoading && (
                    <div role="status" aria-label="در حال بارگذاری پیام‌ها" className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted" />
                    </div>
                  )}
                  {!messagesLoading && messages.length === 0 && (
                    <p className="py-10 text-center text-xs text-muted">هنوز پیامی در این گفتگو ثبت نشده است.</p>
                  )}
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
                        className={cn("flex gap-2", msg.role === "owner" && "flex-row-reverse")}
                      >
                        <div
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full",
                            msg.role === "customer" && "bg-accent/12 text-accent",
                            msg.role === "owner" && "bg-success/12 text-success",
                            (msg.role === "assistant" || msg.role === "system") && "bg-muted/20 text-muted"
                          )}
                        >
                          {msg.role === "owner" ? (
                            <CheckCircle2 className="size-3.5" aria-hidden />
                          ) : msg.role === "system" ? (
                            <XCircle className="size-3.5" aria-hidden />
                          ) : (
                            <MessageSquare className="size-3.5" aria-hidden />
                          )}
                        </div>
                        <div
                          className={cn(
                            "max-w-[82%] rounded-2xl px-3.5 py-3 text-sm",
                            msg.role === "customer" && "bg-surface",
                            msg.role === "owner" && "bg-accent/10",
                            msg.role === "assistant" && "bg-surface text-muted",
                            msg.role === "system" && "border border-line bg-transparent text-xs text-muted"
                          )}
                        >
                          <p className="whitespace-pre-wrap leading-7">{msg.content}</p>
                          <p className="mt-1 text-[10px] text-muted">{formatDate(msg.created_at)}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="border-t border-line bg-surface/35 p-4 sm:p-5">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder="پاسخ خود را بنویسید…"
                      hint="برای ارسال سریع، Ctrl/⌘ + Enter را بزنید."
                      rows={3}
                      disabled={sending}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      size="icon"
                      loading={sending}
                      disabled={!replyText.trim()}
                      onClick={() => void handleSend()}
                      aria-label="ارسال پاسخ"
                      title="ارسال پاسخ"
                    >
                      <Send className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <p className="mt-2 text-[10px] text-muted">پاسخ شما از طریق ربات به مشتری ارسال می‌شود.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
};
