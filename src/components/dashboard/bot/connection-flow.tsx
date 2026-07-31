"use client";

import * as React from "react";
import {
  ArrowRight,
  AtSign,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  Send,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";
import { notifyTelegramConnectionChanged } from "@/lib/settings-events";

// Extracted from the account settings modal so the Telegram bot page and the
// modal's اتصالات section render the exact same connect/disconnect flow.

type BotIdentity = {
  id: string;
  name: string;
  username: string;
};

const TOKEN_RE = /^\d{6,20}:[A-Za-z0-9_-]{20,100}$/;

const CommandRow = ({ command }: { command: string }) => {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      dir="ltr"
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-background/50 px-4 py-3"
    >
      <code className="text-sm font-semibold text-foreground">{command}</code>
      <button
        type="button"
        onClick={() => void copyCommand()}
        className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        aria-label={copied ? "کپی شد" : `کپی ${command}`}
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
};

const guideItemClass =
  "flex gap-3 rounded-2xl border border-line bg-background/35 p-4";

export const ConnectionFlow = () => {
  const { toast } = useToast();
  const [bot, setBot] = React.useState<BotIdentity | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [step, setStep] = React.useState<"telegram" | "botfather" | "create" | "token">("telegram");
  const [token, setToken] = React.useState("");
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

  React.useEffect(() => {
    const loadBot = async () => {
      try {
        const response = await fetch("/api/telegram/status");
        if (!response.ok) return;
        const data = (await response.json()) as {
          bot: BotIdentity | null;
        };
        if (data.bot) setBot(data.bot);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };

    void loadBot();
  }, []);

  const connectBot = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanToken = token.trim();
    if (!TOKEN_RE.test(cleanToken)) {
      setTokenError("توکن کامل BotFather را وارد کنید.");
      return;
    }

    setConnecting(true);
    setTokenError(null);

    try {
      const response = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleanToken }),
      });
      const data = (await response.json()) as {
        bot?: BotIdentity;
        error?: string;
      };

      if (!response.ok || !data.bot) {
        setTokenError(data.error ?? "اتصال ربات انجام نشد؛ دوباره تلاش کنید.");
        return;
      }

      setBot(data.bot);
      setToken("");
      notifyTelegramConnectionChanged();
      toast({
        title: "ربات متصل شد",
        description: `ربات «${data.bot.name}» با موفقیت به حساب شما متصل شد.`,
        variant: "success",
      });
    } catch {
      setTokenError("اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnectBot = async () => {
    if (disconnecting) return;
    setDisconnecting(true);

    try {
      const response = await fetch("/api/telegram/disconnect", {
        method: "POST",
      });

      if (!response.ok) {
        toast({
          title: "قطع اتصال انجام نشد",
          description: "دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      setBot(null);
      setStep("telegram");
      notifyTelegramConnectionChanged();
      toast({
        title: "ربات قطع شد",
        description: "اتصال ربات تلگرام شما قطع شد.",
        variant: "success",
      });
    } catch {
      toast({
        title: "قطع اتصال انجام نشد",
        description: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div role="status" aria-label="در حال بارگذاری" className="space-y-4">
        <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface/40 p-5">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
    );
  }

  if (bot) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-3xl border border-success/25 bg-success/10 p-5">
          <Icon icon={CheckCircle2} tile size="md" tone="success" />
          <div className="min-w-0">
            <p className="font-bold">{bot.name}</p>
            <p dir="ltr" className="mt-1 truncate text-start text-sm text-muted">
              @{bot.username}
            </p>
          </div>
          <Badge variant="success" dot className="ms-auto shrink-0">
            متصل است
          </Badge>
        </div>
        <Button
          variant="outline"
          className="w-full"
          loading={disconnecting}
          startIcon={<LogOut className="size-4" />}
          onClick={() => void disconnectBot()}
        >
          قطع اتصال ربات
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-0 space-y-5">
      {step === "telegram" && (
        <div className="space-y-5">
          <p className="text-sm leading-7 text-muted">
            با اتصال ربات تلگرام، مشتری‌های شما می‌توانند مستقیماً از تلگرام سفارش بدهند و پاسخ بگیرند.
          </p>

          <Button
            size="lg"
            className="w-full"
            startIcon={<Send className="size-4" />}
            onClick={() => setStep("botfather")}
          >
            شروع اتصال ربات تلگرام
          </Button>
        </div>
      )}

      {step === "botfather" && (
        <div className="space-y-5">
          <Icon icon={Bot} tile size="md" tone="accent" />
          <p className="text-xs font-medium text-accent">قدم اول</p>
          <h3 className="text-lg font-black">BotFather را باز کنید</h3>
          <p className="text-sm leading-7 text-muted">
            BotFather ابزار رسمی تلگرام برای ساخت و مدیریت ربات‌هاست. روی دکمه زیر بزنید، سپس در تلگرام «Start» را انتخاب کنید.
          </p>

          <div className="space-y-3">
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              <ExternalLink className="size-4" aria-hidden />
              باز کردن BotFather
            </a>
            <CommandRow command="/start" />
          </div>

          <Alert
            variant="info"
            title="نشان تأیید را بررسی کنید"
            description="ربات رسمی BotFather نام کاربری @BotFather و نشان تأیید تلگرام دارد."
          />

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="ghost" onClick={() => setStep("telegram")} startIcon={<ArrowRight className="size-4" />}>
              قبلی
            </Button>
            <Button className="flex-1" onClick={() => setStep("create")}>
              BotFather باز شد، ادامه
            </Button>
          </div>
        </div>
      )}

      {step === "create" && (
        <div className="space-y-5">
          <Icon icon={AtSign} tile size="md" tone="accent" />
          <p className="text-xs font-medium text-accent">قدم دوم</p>
          <h3 className="text-lg font-black">نام ربات را انتخاب کنید</h3>
          <p className="text-sm leading-7 text-muted">
            دستور ساخت ربات را بفرستید؛ BotFather بعد از آن دو نام از شما می‌خواهد.
          </p>

          <div className="space-y-3">
            <CommandRow command="/newbot" />
            {[
              {
                title: "نام نمایشی",
                copy: "نامی که مشتری می‌بیند؛ مثلاً «پشتیبانی فروشگاه نیلا».",
              },
              {
                title: "نام کاربری",
                copy: "یک نام یکتا با حروف انگلیسی که به bot ختم شود؛ مثلاً NilaSupportBot.",
              },
            ].map((item, index) => (
              <div key={item.title} className={guideItemClass}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
                  {fa(index + 1)}
                </span>
                <div>
                  <p className="text-sm font-bold">{item.title}</p>
                  <p className="mt-1 text-xs leading-6 text-muted">{item.copy}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="ghost" onClick={() => setStep("botfather")} startIcon={<ArrowRight className="size-4" />}>
              قبلی
            </Button>
            <Button className="flex-1" onClick={() => setStep("token")}>
              نام ربات ساخته شد
            </Button>
          </div>
        </div>
      )}

      {step === "token" && (
        <div className="space-y-5">
          <Icon icon={KeyRound} tile size="md" tone="accent" />
          <p className="text-xs font-medium text-accent">قدم سوم</p>
          <h3 className="text-lg font-black">توکن ربات را وارد کنید</h3>
          <p className="text-sm leading-7 text-muted">
            BotFather در آخرین پیام یک توکن بلند می‌فرستد. آن را کامل کپی کنید و در کادر زیر قرار دهید.
          </p>

          <form onSubmit={(event) => void connectBot(event)} noValidate className="space-y-5">
            <Input
              label="توکن ربات"
              type="password"
              dir="rtl"
              className="text-start"
              placeholder="123456789:AA..."
              autoComplete="off"
              spellCheck={false}
              startIcon={<KeyRound />}
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setTokenError(null);
              }}
              error={tokenError ?? undefined}
              hint="توکن فقط برای تأیید ربات به سرور امن پشتیبان فرستاده می‌شود."
              required
            />
            <Button type="submit" loading={connecting} className="w-full" startIcon={<Send className="size-4" />}>
              بررسی و اتصال ربات
            </Button>
          </form>

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="ghost" onClick={() => setStep("create")} startIcon={<ArrowRight className="size-4" />}>
              قبلی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
