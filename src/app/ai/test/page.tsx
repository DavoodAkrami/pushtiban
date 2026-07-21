"use client";

import * as React from "react";
import { Send, Loader2, Bot, Brain, Zap, X, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ProviderId = "openai" | "nvidia-nim" | "openrouter";

type ModelOption = {
  provider: ProviderId;
  id: string;
  label: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
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

const AIChatTestPage = () => {
  const [models, setModels] = React.useState<Record<string, string[]>>({});
  const [configuredProviders, setConfiguredProviders] = React.useState<
    ProviderId[]
  >([]);
  const [selectedModel, setSelectedModel] = React.useState<ModelOption | null>(
    null
  );
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [modelsLoading, setModelsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        setError(
          "مدل‌ها بارگذاری نشدند. مطمئن شوید کلیدهای API تنظیم شده‌اند."
        );
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
        options.push({
          provider: providerId,
          id: model,
          label: model,
        });
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
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedModel.provider,
          model: selectedModel.id,
          messages: history,
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

  const SelectedIcon = selectedModel
    ? PROVIDER_ICONS[selectedModel.provider]
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      <header className="border-b border-line bg-surface/40 px-6 py-4">
        <h1 className="text-2xl font-black">تست مدل‌های AI</h1>
        <p className="mt-1 text-sm text-muted">
          مدل را انتخاب کنید و پیام بفرستید. برای OpenRouter، حالت auto یک
          مدل رایگان آماده را انتخاب می‌کند.
        </p>
      </header>

      {error && (
        <div
          className="mx-4 mt-4 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="mx-4 mb-4 mt-4 flex flex-wrap items-end gap-3">
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
      </div>

      <div className="mx-4 mb-4 flex-1 overflow-hidden rounded-3xl border border-line bg-surface/30">
        <div className="h-full overflow-y-auto p-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="flex h-64 flex-col items-center justify-center text-center text-muted">
                <Bot className="mb-3 size-12 opacity-50" />
                <p className="text-lg font-medium">هیچ پیامی وجود ندارد</p>
                <p className="mt-1 text-sm">
                  مدلی را انتخاب کنید و پیام بفرستید
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
                    "max-w-[70%] rounded-3xl p-4",
                    msg.role === "user"
                      ? "bg-accent/10 text-start"
                      : "border border-line bg-surface"
                  )}
                >
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
      </div>

      <div className="mx-4 mb-6 flex gap-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedModel
              ? "پیام خود را تایپ کنید..."
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
      </div>
    </div>
  );
};

export default AIChatTestPage;
