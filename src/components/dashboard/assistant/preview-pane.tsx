"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Loader2,
  RotateCcw,
  Send,
  UserRound,
  Users,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import {
  RagInspector,
  type BusinessDataRetrievalView,
  type RagChunkView,
  type RagFactView,
  type RagIntentView,
  type RagQaView,
  type RagSourceView,
} from "@/components/dashboard/assistant/rag-inspector";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { cn, fa } from "@/lib/utils";
import { useBusinessUsage } from "@/store/use-usage";

// ---------------------------------------------------------------------------
// A real conversation with the real assistant. /api/ai/preview calls the same
// generator the Telegram webhook does, so what appears here is what a customer
// would receive — including the Telegram HTML formatting, the escalation
// decision, and the monthly message cost.
// ---------------------------------------------------------------------------

type PreviewMessage = {
  role: "user" | "assistant";
  /** Telegram-flavoured HTML for assistant turns; plain text for the customer's. */
  html?: string | null;
  text: string;
  needsHuman?: boolean;
  retrieval?: {
    intent: RagIntentView | null;
    chunks: RagChunkView[];
    sources: RagSourceView[];
    facts: RagFactView[];
    qa: RagQaView[];
    businessData?: BusinessDataRetrievalView | null;
    embeddingsUnavailable?: boolean;
  } | null;
};

type PreviewResponse = {
  html?: string | null;
  text?: string | null;
  needsHuman?: boolean;
  handoffEnabled?: boolean;
  retrieval?: PreviewMessage["retrieval"];
  error?: string;
  assistantDisabled?: boolean;
  blocked?: boolean;
};

const SUGGESTED_QUESTIONS = [
  "قیمت و موجودی یکی از محصولاتتان چقدر است؟",
  "هزینه و زمان ارسال سفارش چقدر است؟",
  "شرایط لغو یا بازگشت سفارش چیست؟",
  "می‌خواهم با پشتیبان انسانی صحبت کنم.",
];

const Bubble = ({ message }: { message: PreviewMessage }) => {
  const isCustomer = message.role === "user";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5",
        isCustomer && "flex-row-reverse"
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isCustomer ? "bg-card text-muted" : "bg-accent/15 text-accent"
        )}
      >
        {isCustomer ? (
          <UserRound className="size-4" aria-hidden />
        ) : (
          <Bot className="size-4" aria-hidden />
        )}
      </span>

      <div className="min-w-0 max-w-[85%] space-y-2">
        <div
          className={cn(
            "rounded-3xl px-4 py-2.5 text-sm leading-7",
            isCustomer
              ? "bg-card text-foreground"
              : "border border-line bg-surface/50"
          )}
        >
          {message.role === "assistant" && !message.text ? (
            <span role="status" className="flex items-center gap-2 text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span className="sr-only">دستیار در حال آماده‌کردن پاسخ است</span>
            </span>
          ) : message.html ? (
            // Telegram's own sanitized subset — every tag is produced by
            // markdownToTelegramHtml, which escapes everything else.
            <span dangerouslySetInnerHTML={{ __html: message.html }} />
          ) : (
            <span className="whitespace-pre-wrap">{message.text}</span>
          )}
        </div>

        {message.needsHuman && (
          <Badge variant="warning" dot className="text-[10px]">
            این پیام به پشتیبان انسانی ارجاع می‌شد
          </Badge>
        )}

        {message.retrieval && (
          <RagInspector
            intent={message.retrieval.intent}
            chunks={message.retrieval.chunks}
            sources={message.retrieval.sources}
            facts={message.retrieval.facts}
            qa={message.retrieval.qa}
            businessData={message.retrieval.businessData}
            embeddingsUnavailable={message.retrieval.embeddingsUnavailable}
          />
        )}
      </div>
    </div>
  );
};

export const AssistantPreviewPane = ({
  enabled,
  providerConfigured,
  loadError,
}: {
  enabled: boolean;
  providerConfigured: boolean;
  loadError: boolean;
}) => {
  const reduce = useReducedMotion();
  const { usage, refresh } = useBusinessUsage();
  const [messages, setMessages] = React.useState<PreviewMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "nearest",
    });
  }, [messages, reduce]);

  const messagesLeft = usage?.messagesLeft ?? null;
  const outOfMessages = messagesLeft !== null && messagesLeft <= 0;
  const available = enabled && providerConfigured && !loadError;

  const send = async () => {
    const question = input.trim();
    if (!question || sending) return;

    // The history we send matches what memory.ts would have kept for a real
    // customer, so follow-ups resolve the same way they do on Telegram.
    const history = messages.map((m) => ({ role: m.role, text: m.text }));

    setInput("");
    setLastError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: question },
      { role: "assistant", text: "" },
    ]);

    try {
      const res = await fetch("/api/ai/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const data = (await res.json()) as PreviewResponse;

      if (!res.ok) throw new Error(data.error || "پاسخ دریافت نشد.");

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          text: data.text ?? "",
          html: data.html ?? null,
          needsHuman: data.needsHuman,
          retrieval: data.retrieval ?? null,
        };
        return next;
      });
      // A preview message costs the owner a real message — keep the sidebar honest.
      void refresh();
    } catch (error) {
      setMessages((prev) => prev.slice(0, -2));
      setInput(question);
      setLastError(
        error instanceof Error ? error.message : "دوباره تلاش کنید."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-labelledby="assistant-preview-title"
      className="rounded-3xl border border-line bg-surface/40 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="assistant-preview-title" className="text-sm font-bold">
            گفتگوی آزمایشی
          </h2>
          <p className="mt-1 text-xs leading-6 text-muted">
            پاسخ از همان شخصیت، دانش، داده‌های کسب‌وکار و مسیر واقعی مشتری ساخته
            می‌شود.
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            startIcon={<RotateCcw className="size-4" />}
            onClick={() => {
              setMessages([]);
              setLastError(null);
              inputRef.current?.focus();
            }}
            disabled={sending}
          >
            گفتگوی تازه
          </Button>
        )}
      </div>

      <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="مراحل آزمایش پاسخ">
        {["پیام را انتخاب کنید", "پاسخ را ببینید", "منابع را بررسی کنید"].map(
          (step, index) => (
            <li
              key={step}
              className="flex items-center gap-2 rounded-2xl border border-line bg-background/35 px-3 py-2.5 text-xs text-muted"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card font-bold text-foreground">
                {fa(index + 1)}
              </span>
              {step}
            </li>
          )
        )}
      </ol>

      {loadError && (
        <Alert
          variant="error"
          className="mt-4"
          title="وضعیت دستیار بارگذاری نشد"
          description="صفحه را تازه کنید و دوباره تلاش کنید."
        />
      )}

      {!loadError && !providerConfigured && (
        <Alert
          variant="warning"
          className="mt-4"
          title="ارائه‌دهندهٔ هوش مصنوعی آماده نیست"
          description="پیش از آزمایش، کلید ارائه‌دهنده را روی سرور تنظیم کنید."
        />
      )}

      {!loadError && providerConfigured && !enabled && (
        <Alert
          variant="info"
          className="mt-4"
          title="برای آزمایش، دستیار باید روشن باشد"
          description="همان‌طور که برای مشتری واقعی هم پاسخی فرستاده نمی‌شود."
        >
          <Link
            href="/dashboard/assistant"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "mt-3",
            })}
          >
            رفتن به تنظیمات
          </Link>
        </Alert>
      )}

      {available && (
        <>
          <p className="mt-4 flex flex-wrap items-center gap-1.5 rounded-2xl bg-background/50 px-3 py-2 text-[11px] leading-6 text-muted">
            <Users className="size-3.5 shrink-0" aria-hidden />
            هر پیام آزمایشی، مثل یک پیام واقعی، از سهمیهٔ ماهانهٔ شما کم می‌شود.
            {messagesLeft !== null && (
              <span className="font-bold text-foreground">
                {fa(messagesLeft)} پیام باقی مانده
              </span>
            )}
          </p>

          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            className="mt-4 max-h-[34rem] min-h-72 space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-background/30 p-4"
          >
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-2xl flex-col items-center py-8 text-center">
                <Bot className="size-8 text-accent" aria-hidden />
                <h3 className="mt-3 font-bold">با یک موقعیت واقعی شروع کنید</h3>
                <p className="mt-1 text-sm leading-7 text-muted">
                  یکی از نمونه‌ها را انتخاب کنید یا پیام خودتان را بنویسید.
                  انتخاب نمونه فقط متن را آماده می‌کند و چیزی ارسال نمی‌شود.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <Button
                      key={question}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInput(question);
                        setLastError(null);
                        inputRef.current?.focus();
                      }}
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((message, index) => (
                  <motion.div
                    key={index}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.28, ease: luxe }}
                  >
                    <Bubble message={message} />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={endRef} />
          </div>

          {lastError && (
            <Alert
              variant="error"
              className="mt-3"
              title="آزمایش انجام نشد"
              description={lastError}
              onDismiss={() => setLastError(null)}
            />
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="mt-3 flex items-end gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="پیام مشتری را بنویسید…"
              aria-label="پیام آزمایشی"
              disabled={sending || outOfMessages}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="ارسال پیام آزمایشی"
              loading={sending}
              disabled={!input.trim() || outOfMessages}
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </form>

          {outOfMessages && (
            <p className="mt-2 text-xs text-danger">
              سهمیهٔ پیام این ماه پر شده است.
            </p>
          )}
        </>
      )}
    </section>
  );
};
