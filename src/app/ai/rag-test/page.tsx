"use client";

import * as React from "react";
import {
  Send,
  Loader2,
  Bot,
  Brain,
  Zap,
  X,
  UserRound,
  Database,
  FileText,
  ListChecks,
  Search,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, fa } from "@/lib/utils";

type ProviderId = "openai" | "nvidia-nim" | "openrouter";

type ModelOption = {
  provider: ProviderId;
  id: string;
  label: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  intent?: RagIntentView | null;
  chunks?: RagChunkView[];
  sources?: RagSourceView[];
  facts?: RagFactView[];
  qa?: RagQaView[];
  embeddingsUnavailable?: boolean;
};

type RagIntentView = {
  category: string;
  confidence: number;
  searchQuery?: string | null;
};

type RagFactView = {
  id: string;
  category: string;
  factText: string;
};

type RagQaView = {
  id: string;
  question: string;
  answer: string;
  category: string;
  similarity: number;
};

type RagChunkView = {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  category?: string;
  similarity: number;
};

type RagSourceView = {
  id: string;
  title: string;
};

type KnowledgeSourceRow = {
  id: string;
  title: string;
  source_type: "text" | "file" | "url";
  status: "processing" | "ready" | "error";
  created_at: string;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  "nvidia-nim": "NVIDIA NIM",
  openrouter: "OpenRouter",
};

const PROVIDER_ICONS: Record<
  ProviderId,
  React.ComponentType<{ className?: string }>
> = {
  openai: Brain,
  "nvidia-nim": Zap,
  openrouter: Bot,
};

const OPENROUTER_AUTO_ID = "openrouter/free";

// ---- Stored Q&A list (loaded from the knowledge base) ---------------------

type KnowledgeQaRow = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

const RagTestPage = () => {
  const reduce = useReducedMotion();
  const [models, setModels] = React.useState<Record<string, string[]>>({});
  const [configuredProviders, setConfiguredProviders] = React.useState<
    ProviderId[]
  >([]);
  const [selectedModel, setSelectedModel] =
    React.useState<ModelOption | null>(null);

  const [sources, setSources] = React.useState<KnowledgeSourceRow[]>([]);
  const [sourcesLoading, setSourcesLoading] = React.useState(true);
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | null>(
    null
  );

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [modelsLoading, setModelsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Stored Q&A list — loaded from the user's knowledge base so you can see the
  // exact data the RAG system matches against. Read-only here; manage Q&A in the
  // dashboard AI panel. This page is for probing retrieval, not editing content.
  const [qaList, setQaList] = React.useState<KnowledgeQaRow[]>([]);
  const [qaLoading, setQaLoading] = React.useState(true);

  const loadQa = React.useCallback(async () => {
    setQaLoading(true);
    try {
      const res = await fetch("/api/ai/knowledge/qa");
      const data = (await res.json()) as {
        qa?: KnowledgeQaRow[];
        error?: string;
      };
      if (res.ok && data.qa) setQaList(data.qa);
    } catch {
      // soft-fail; the panel will show the empty state
    } finally {
      setQaLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadQa();
  }, [loadQa]);

  const loadSources = React.useCallback(async () => {
    setSourcesLoading(true);
    try {
      const res = await fetch("/api/ai/rag/sources");
      const data = (await res.json()) as {
        sources?: KnowledgeSourceRow[];
        setupRequired?: boolean;
        error?: string;
      };
      if (data.setupRequired) {
        setSources([]);
      } else if (data.sources) {
        setSources(data.sources);
      }
    } catch {
      // soft-fail; the panel will show empty state
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSources();
  }, [loadSources]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
    });
  }, [messages, reduce]);

  React.useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch("/api/ai/models");
        if (!response.ok) throw new Error("Failed to load models");
        const data = (await response.json()) as {
          models: Record<string, string[]>;
          providers: ProviderId[];
        };
        setModels(data.models);
        setConfiguredProviders(data.providers);
      } catch {
        setError("مدل‌ها بارگذاری نشدند. کلیدهای API را بررسی کنید.");
      } finally {
        setModelsLoading(false);
      }
    };
    void loadModels();
  }, []);

  const allModelOptions = React.useMemo(() => {
    const options: ModelOption[] = [];
    for (const providerId of configuredProviders) {
      const modelList = models[providerId] ?? [];
      if (providerId === "openrouter") {
        options.push({
          provider: "openrouter",
          id: OPENROUTER_AUTO_ID,
          label: "auto (free) — انتخاب خودکار مدل رایگان",
        });
      }
      for (const model of modelList) {
        if (model === OPENROUTER_AUTO_ID) continue;
        options.push({ provider: providerId, id: model, label: model });
      }
    }
    return options;
  }, [models, configuredProviders]);

  const selectOptions: SelectOption[] = React.useMemo(
    () =>
      allModelOptions.map((opt) => {
        const Icon = PROVIDER_ICONS[opt.provider];
        return {
          value: `${opt.provider}:${opt.id}`,
          label:
            opt.id === OPENROUTER_AUTO_ID
              ? `${PROVIDER_LABELS[opt.provider]} · auto (free)`
              : `${PROVIDER_LABELS[opt.provider]} · ${opt.id}`,
          description:
            opt.id === OPENROUTER_AUTO_ID
              ? "OpenRouter یک مدل رایگان آماده پاسخ را انتخاب می‌کند"
              : PROVIDER_LABELS[opt.provider],
          icon: <Icon className="size-4" />,
        };
      }),
    [allModelOptions]
  );

  const sourceSelectOptions: SelectOption[] = React.useMemo(
    () => [
      { value: "all", label: "همه منابع دانش" },
      ...sources.map((s) => ({
        value: s.id,
        label: s.title,
        description: s.source_type,
      })),
    ],
    [sources]
  );

  const handleSend = async () => {
    if (!input.trim() || !selectedModel || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setError(null);

    const history: Message[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    const assistantIndex = history.length;

    try {
      const response = await fetch("/api/ai/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedModel.provider,
          model: selectedModel.id,
          question: userMessage,
          sourceId: selectedSourceId === "all" ? null : selectedSourceId,
          stream: true,
        }),
      });

      if (!response.ok) {
        const raw = await response.text();
        let message = `HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          if (raw.trim()) message = raw.trim().slice(0, 300);
        }
        throw new Error(message);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response stream");

      let buffer = "";
      let ragInjected = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          let data: {
            rag?: {
              intent: RagIntentView | null;
              chunks: RagChunkView[];
              sources: RagSourceView[];
              facts: RagFactView[];
              qa: RagQaView[];
              embeddingsUnavailable: boolean;
            };
            content?: string;
            done?: boolean;
            error?: string;
            model?: string;
          };
          try {
            data = JSON.parse(line.slice(6)) as typeof data;
          } catch {
            continue;
          }
          if (data.error) throw new Error(data.error);

          if (data.rag && !ragInjected) {
            ragInjected = true;
            setMessages((prev) => {
              const next = [...prev];
              const current = next[assistantIndex];
              if (!current) return prev;
              next[assistantIndex] = {
                ...current,
                intent: data.rag?.intent ?? null,
                chunks: data.rag?.chunks ?? [],
                sources: data.rag?.sources ?? [],
                facts: data.rag?.facts ?? [],
                qa: data.rag?.qa ?? [],
                embeddingsUnavailable: data.rag?.embeddingsUnavailable,
              };
              return next;
            });
          }

          if (data.content) {
            setMessages((prev) => {
              const next = [...prev];
              const current = next[assistantIndex];
              if (!current) return prev;
              next[assistantIndex] = {
                ...current,
                content: current.content + data.content,
              };
              return next;
            });
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطایی رخ داد");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (modelsLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  const SelectedIcon = selectedModel ? PROVIDER_ICONS[selectedModel.provider] : null;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-line bg-surface/40 px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-2">
            <Database className="size-6 text-accent" />
            <h1 className="text-2xl font-black">تست RAG — بازیابی و پاسخ</h1>
          </div>
          <p className="mt-1 text-sm text-muted">
            سوالی بپرسید؛ ابتدا بخش‌های بازیابی‌شده از پایگاه دانش را می‌بینید،
            سپس پاسخ مدل را به همراه منابع.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <div
            className="mb-4 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Stored Q&A list — shows the exact data the RAG system matches against.
            Read-only here; this page is for probing retrieval, not editing Q&A. */}
        <section className="mb-6 rounded-3xl border border-line bg-surface/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks className="size-4 text-accent" />
              <h2 className="text-sm font-bold">
                پرسش‌های پایگاه دانش ({fa(qaLoading ? 0 : qaList.length)})
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadQa()}
              aria-label="تازه‌سازی پرسش‌ها"
            >
              <Search className="size-3.5" />
              تازه‌سازی
            </Button>
          </div>

          {qaLoading ? (
            <div className="flex items-center justify-center py-6 text-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : qaList.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              هنوز پرسش و پاسخی ثبت نشده. از داشبورد پرسشی اضافه کنید.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pe-1">
              {qaList.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-line bg-surface/50 p-3 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge variant="muted" className="text-[10px]">
                      {row.category}
                    </Badge>
                  </div>
                  <p className="font-bold">پرسش: {row.question}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted">
                    پاسخ: {row.answer}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] leading-5 text-muted">
            این‌ها همان پرسش‌های آماده‌ای هستند که RAG برای یافتن پاسخ، سوال کاربر را
            با آن‌ها تطبیق می‌دهد. با سوال پرسیدن در پایین صفحه، نتیجه تطبیق و
            امتیاز شباهت را در بخش «داده‌های بازیابی‌شده» ببینید.
          </p>
        </section>

        {/* Source selector */}
        <section className="mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] max-w-md flex-1">
              <Select
                searchable
                options={sourceSelectOptions}
                value={selectedSourceId ?? "all"}
                onChange={(v) => setSelectedSourceId(v ?? "all")}
                placeholder="منبع دانش را انتخاب کنید"
                searchPlaceholder="جستجوی منبع…"
                emptyText={
                  sourcesLoading
                    ? "بارگذاری…"
                    : sources.length === 0
                      ? "هنوز سندی ذخیره نشده"
                      : "منبعی پیدا نشد"
                }
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadSources()}
              aria-label="تازه‌سازی منابع"
            >
              <Search className="size-3.5" />
              تازه‌سازی
            </Button>
          </div>

          {sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.map((source) => (
                <Badge
                  key={source.id}
                  variant={
                    selectedSourceId === source.id ? "accent" : "muted"
                  }
                >
                  <FileText className="size-3" />
                  {source.title}
                  <button
                    type="button"
                    aria-label={` انتخاب ${source.title}`}
                    className="ms-0.5 rounded-full p-0.5 hover:bg-accent/20"
                    onClick={() => setSelectedSourceId(source.id)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </section>

        {/* Model selector */}
        <section className="mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] max-w-md flex-1">
            <Select
              searchable
              options={selectOptions}
              value={
                selectedModel
                  ? `${selectedModel.provider}:${selectedModel.id}`
                  : undefined
              }
              onChange={(v) => {
                if (!v) {
                  setSelectedModel(null);
                  return;
                }
                const [provider, ...rest] = v.split(":");
                const id = rest.join(":");
                const match = allModelOptions.find(
                  (o) => o.provider === provider && o.id === id
                );
                setSelectedModel(
                  match ?? {
                    provider: provider as ProviderId,
                    id,
                    label: id,
                  }
                );
              }}
              placeholder="مدل را انتخاب کنید"
              searchPlaceholder="جستجوی مدل…"
              emptyText={
                configuredProviders.length === 0
                  ? "هیچ پروایدری پیکربندی نشده"
                  : "مدلی پیدا نشد"
              }
            />
          </div>
          {selectedModel && SelectedIcon && (
            <Badge variant="accent" className="mb-1.5 self-center">
              <SelectedIcon className="size-3" />
              {PROVIDER_LABELS[selectedModel.provider]}
              <button
                type="button"
                aria-label="پاک کردن مدل"
                className="ms-0.5 rounded-full p-0.5 hover:bg-accent/20"
                onClick={() => setSelectedModel(null)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </section>

        {/* Chat + retrieved chunks */}
        <section className="mb-6 flex-1 overflow-hidden rounded-3xl border border-line bg-surface/30">
          <div className="h-[420px] overflow-y-auto p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="flex h-72 flex-col items-center justify-center text-center text-muted">
                  <Database className="mb-3 size-12 opacity-50" />
                  <p className="text-lg font-medium">هنوز پرسشی نیست</p>
                  <p className="mt-1 text-sm">
                    مدل را انتخاب کنید و سوال را بپرسید تا داده‌های بازیابی‌شده و
                    امتیاز شباهت را ببینید
                  </p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" && "flex-row-reverse"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      msg.role === "user"
                        ? "bg-accent/12 text-accent"
                        : "bg-success/12 text-success"
                    )}
                  >
                    {msg.role === "user" ? (
                      <UserRound className="size-4" />
                    ) : (
                      <Bot className="size-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-3xl p-4",
                      msg.role === "user"
                        ? "bg-accent/10 text-start"
                        : "border border-line bg-surface"
                    )}
                  >
                    {/* Retrieved-chunks inspector — also shown when nothing
                        matched, so the intent + rewritten search query are
                        visible for debugging empty retrievals. */}
                    {msg.role === "assistant" &&
                      (msg.chunks !== undefined ||
                        msg.facts !== undefined ||
                        msg.qa !== undefined ||
                        msg.intent !== undefined ||
                        msg.embeddingsUnavailable) && (
                        <RagChunksPanel
                          intent={msg.intent ?? null}
                          chunks={msg.chunks ?? []}
                          sources={msg.sources ?? []}
                          facts={msg.facts ?? []}
                          qa={msg.qa ?? []}
                          embeddingsUnavailable={msg.embeddingsUnavailable}
                        />
                    )}
                    <p className="whitespace-pre-wrap">
                      {msg.content || (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </section>

        <section className="mb-8 flex gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedModel
                ? "سوال خود را بنویسید…"
                : "ابتدا مدلی را انتخاب کنید"
            }
            disabled={!selectedModel || loading}
            className="flex-1"
            autoFocus
          />
          <Button
            className="shrink-0"
            size="lg"
            loading={loading}
            disabled={!input.trim() || !selectedModel}
            onClick={() => void handleSend()}
            aria-label="ارسال"
          >
            <Send className="size-4" />
          </Button>
        </section>
      </main>
    </div>
  );
};

// ---- Retrieved context inline panel ----------------------------------------

type RagChunksPanelProps = {
  intent: RagIntentView | null;
  chunks: RagChunkView[];
  sources: RagSourceView[];
  facts: RagFactView[];
  qa: RagQaView[];
  embeddingsUnavailable?: boolean;
};

const RagChunksPanel = ({
  intent,
  chunks,
  sources,
  facts,
  qa,
  embeddingsUnavailable,
}: RagChunksPanelProps) => {
  const [expanded, setExpanded] = React.useState(false);
  const reduce = useReducedMotion() ?? false;

  if (embeddingsUnavailable) {
    return (
      <div className="mb-3 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        امبدینگ پیکربندی نشده؛ پاسخ بدون بازیابی از پایگاه دانش است.
        {(facts.length > 0 || qa.length > 0) && (
          <span className="mt-1 block">
            اطلاعات کسب‌وکار و پرسش آماده همچنان تزریق شدند.
          </span>
        )}
      </div>
    );
  }

  if (!chunks.length && !facts.length && !qa.length) {
    // Nothing matched — still show the intent and the rewritten search query
    // so the user can see WHAT was searched and debug why it found nothing.
    return (
      <div className="mb-3 rounded-2xl border border-line bg-background/40 p-3 text-xs text-muted">
        <span className="flex flex-wrap items-center gap-2">
          <Database className="size-3.5 text-accent" />
          داده‌ای بازیابی نشد
          {intent && intent.category !== "general" && (
            <Badge variant="accent" className="text-[10px]">
              {intent.category} · {fa(intent.confidence.toFixed(2))}
            </Badge>
          )}
          {intent?.searchQuery && (
            <Badge variant="default" className="text-[10px]" dir="rtl">
              جستجو: {intent.searchQuery}
            </Badge>
          )}
        </span>
      </div>
    );
  }

  const totalItems = chunks.length + facts.length + qa.length;

  return (
    <div className="mb-3 rounded-2xl border border-line bg-background/40 p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-start text-xs font-bold text-muted"
      >
        <span className="flex items-center gap-2">
          <Database className="size-3.5 text-accent" />
          داده‌های بازیابی‌شده ({fa(totalItems)})
          {intent && intent.category !== "general" && (
            <Badge variant="accent" className="text-[10px]">
              {intent.category} · {fa(intent.confidence.toFixed(2))}
            </Badge>
          )}
          {intent?.searchQuery && (
            <Badge variant="default" className="text-[10px]" dir="rtl">
              جستجو: {intent.searchQuery}
            </Badge>
          )}
        </span>
        <span className="text-accent">{expanded ? "بستن" : "نمایش"}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3">
              {/* Standing facts */}
              {facts.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold text-accent">
                    اطلاعات کسب‌وکار ({fa(facts.length)})
                  </p>
                  <div className="space-y-1.5">
                    {facts.map((fact, i) => (
                      <div
                        key={fact.id}
                        className="rounded-xl border border-line bg-surface/50 p-2 text-xs"
                      >
                        <Badge variant="muted" className="mb-1 text-[10px]">
                          {fact.category}
                        </Badge>
                        <p className="whitespace-pre-wrap text-muted">
                          [F{fa(i + 1)}] {fact.factText}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Curated Q&A */}
              {qa.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold text-accent">
                    پرسش و پاسخ آماده ({fa(qa.length)})
                  </p>
                  <div className="space-y-1.5">
                    {qa.map((pair, i) => (
                      <div
                        key={pair.id}
                        className="rounded-xl border border-line bg-surface/50 p-2 text-xs"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant="muted" className="text-[10px]">
                            {pair.category}
                          </Badge>
                          <Badge variant="muted" className="text-[10px]">
                            شباهت: {fa(pair.similarity.toFixed(3))}
                          </Badge>
                        </div>
                        <p className="font-bold">[Q{fa(i + 1)}] {pair.question}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-muted">
                          {pair.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vector-retrieved chunks */}
              {chunks.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold text-accent">
                    بخش‌های بازیابی‌شده ({fa(chunks.length)})
                  </p>
                  <div className="space-y-1.5">
                    {chunks.map((chunk, index) => {
                      const sourceMeta = sources.find(
                        (s) => s.id === chunk.sourceId
                      );
                      return (
                        <div
                          key={chunk.id}
                          className="rounded-xl border border-line bg-surface/50 p-2 text-xs"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-bold text-accent">
                              [{fa(index + 1)}]
                            </span>
                            <div className="flex gap-1">
                              {chunk.category && (
                                <Badge variant="muted" className="text-[10px]">
                                  {chunk.category}
                                </Badge>
                              )}
                              <Badge variant="muted" className="text-[10px]">
                                شباهت: {fa(chunk.similarity.toFixed(3))}
                              </Badge>
                            </div>
                          </div>
                          {sourceMeta && (
                            <p className="mb-1 text-[10px] text-muted">
                              منبع: {sourceMeta.title} · بخش{" "}
                              {fa(chunk.chunkIndex + 1)}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-muted">
                            {chunk.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RagTestPage;
