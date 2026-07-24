"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Inbox,
  Loader2,
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
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  customer_display_name: string | null;
  customer_username: string | null;
  last_customer_message_text: string | null;
  last_customer_message_at: string | null;
  status: string;
  queued_reason: string;
  created_at: string;
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
  conv.customer_display_name ??
  (conv.customer_username ? `@${conv.customer_username}` : "مشتری");

export const InboxPanel = ({
  initialConversations,
  setupRequired,
}: InboxPanelProps) => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const [conversations, setConversations] =
    React.useState<Conversation[]>(initialConversations);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox?status=open");
      const data = (await res.json()) as { conversations?: Conversation[] };
      if (res.ok && data.conversations) setConversations(data.conversations);
    } catch {
      // soft-fail
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = React.useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/inbox/${conversationId}`);
      const data = (await res.json()) as {
        conversation?: Conversation;
        messages?: Message[];
      };
      if (res.ok && data.messages) setMessages(data.messages);
    } catch {
      // soft-fail
    } finally {
      setMessagesLoading(false);
    }
  }, []);

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
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, status: "answered" } : c
        )
      );
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

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">صندوق پیام‌ها</h1>
          <p className="mt-2 text-sm leading-7 text-muted">
            گفتگوهایی که به پشتیبان ارجاع داده شده‌اند.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          تازه‌سازی
        </Button>
      </header>

      {setupRequired && (
        <Alert
          variant="warning"
          title="راه‌اندازی صندوق کامل نشده"
          description="اسکریپت inbox.sql را در Supabase SQL Editor اجرا کنید."
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <section
          className={cn(
            "rounded-3xl border border-line bg-surface/30 p-2",
            "max-h-[70vh] overflow-y-auto"
          )}
        >
          {conversations.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-muted">
              <Inbox className="mb-2 size-10 opacity-50" />
              <p className="text-sm">هیچ گفتگوی باز نیست</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(conv.id)}
                    className={cn(
                      "w-full rounded-2xl p-3 text-start transition-colors",
                      selectedId === conv.id
                        ? "bg-accent/10 border border-accent/30"
                        : "hover:bg-surface/50 border border-transparent"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">
                        {customerLabel(conv)}
                      </span>
                      <Badge
                        variant={
                          conv.status === "open" ? "accent" : "muted"
                        }
                        className="shrink-0 text-[10px]"
                      >
                        {STATUS_LABELS[conv.status] ?? conv.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {conv.last_customer_message_text ?? "(بدون متن)"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {formatDate(conv.last_customer_message_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Transcript view */}
        <section className="rounded-3xl border border-line bg-surface/30">
          {!selected ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-muted">
              <MessageSquare className="mb-2 size-10 opacity-50" />
              <p className="text-sm">یک گفتگو را برای مشاهده انتخاب کنید</p>
            </div>
          ) : (
            <div className="flex h-full max-h-[70vh] flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line p-4">
                <div className="flex items-center gap-3">
                  <Icon
                    icon={MessageSquare}
                    tile
                    size="sm"
                    tone="accent"
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {customerLabel(selected)}
                    </p>
                    {selected.customer_username && (
                      <a
                        href={`https://t.me/${selected.customer_username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent hover:underline"
                      >
                        @{selected.customer_username}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="muted" className="text-[10px]">
                    {REASON_LABELS[selected.queued_reason] ?? selected.queued_reason}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => void handleClose(selected.id)}
                    aria-label="بستن گفتگو"
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messagesLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-6 animate-spin text-muted" />
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
                      className={cn(
                        "flex gap-2",
                        msg.role === "owner" && "flex-row-reverse"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full",
                          msg.role === "customer" && "bg-accent/12 text-accent",
                          msg.role === "owner" && "bg-success/12 text-success",
                          msg.role === "assistant" && "bg-muted/20 text-muted",
                          msg.role === "system" && "bg-muted/20 text-muted"
                        )}
                      >
                        {msg.role === "owner" ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : msg.role === "system" ? (
                          <XCircle className="size-3.5" />
                        ) : (
                          <MessageSquare className="size-3.5" />
                        )}
                      </div>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl p-3 text-sm",
                          msg.role === "customer" && "bg-surface",
                          msg.role === "owner" &&
                            "bg-accent/10",
                          msg.role === "assistant" &&
                            "bg-surface text-muted",
                          msg.role === "system" &&
                            "border border-line bg-transparent text-xs text-muted"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className="mt-1 text-[10px] text-muted">
                          {formatDate(msg.created_at)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Reply box */}
              <div className="border-t border-line p-4">
                <div className="flex gap-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="پاسخ خود را بنویسید…"
                    rows={2}
                    disabled={sending}
                  />
                  <Button
                    className="shrink-0 self-end"
                    size="lg"
                    loading={sending}
                    disabled={!replyText.trim()}
                    onClick={() => void handleSend()}
                    aria-label="ارسال پاسخ"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted">
                  پاسخ شما از طریق ربات به مشتری ارسال می‌شود.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
