"use client";

import * as React from "react";
import {
  ArrowRight,
  AtSign,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  Send,
  UserRound,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type ProfileDetails = {
  fullName: string;
  businessName: string;
};

type BotIdentity = {
  id: string;
  name: string;
  username: string;
};

type SettingsSection = "profile" | "connections";

type SettingsModalProps = ProfileDetails & {
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfileUpdated: (profile: ProfileDetails) => void;
  restoreFocus: () => void;
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

const ConnectionFlow = () => {
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

const SECTIONS: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "پروفایل", icon: UserRound },
  { id: "connections", label: "اتصالات", icon: Link2 },
];

export const SettingsModal = ({
  businessName,
  email,
  fullName,
  open,
  onOpenChange,
  onProfileUpdated,
  restoreFocus,
}: SettingsModalProps) => {
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("profile");
  const [draftFullName, setDraftFullName] = React.useState(fullName);
  const [draftBusinessName, setDraftBusinessName] =
    React.useState(businessName);
  const [savedFullName, setSavedFullName] = React.useState(fullName);
  const [savedBusinessName, setSavedBusinessName] =
    React.useState(businessName);
  const [fullNameError, setFullNameError] = React.useState("");
  const [businessNameError, setBusinessNameError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  const headingId = `settings-${activeSection}-title`;

  React.useEffect(() => {
    if (!open) return;
    setActiveSection("profile");
    const nextFullName = fullName.trim();
    const nextBusinessName = businessName.trim();
    setDraftFullName(nextFullName);
    setDraftBusinessName(nextBusinessName);
    setSavedFullName(nextFullName);
    setSavedBusinessName(nextBusinessName);
    setFullNameError("");
    setBusinessNameError("");
  }, [businessName, fullName, open]);

  const normalizedFullName = draftFullName.trim();
  const normalizedBusinessName = draftBusinessName.trim();
  const hasChanges =
    normalizedFullName !== savedFullName ||
    normalizedBusinessName !== savedBusinessName;

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextFullNameError =
      normalizedFullName.length < 3 || normalizedFullName.length > 80
        ? `نام شما باید بین ${fa(3)} تا ${fa(80)} حرف باشد.`
        : "";
    const nextBusinessNameError =
      normalizedBusinessName.length < 2 ||
      normalizedBusinessName.length > 100
        ? `نام کسب‌وکار باید بین ${fa(2)} تا ${fa(100)} حرف باشد.`
        : "";

    setFullNameError(nextFullNameError);
    setBusinessNameError(nextBusinessNameError);
    if (nextFullNameError || nextBusinessNameError || !hasChanges) return;

    setSaving(true);
    let profileSaved = false;

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast({
          title: "ذخیره پروفایل انجام نشد",
          description: "صفحه را تازه‌سازی کنید و دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: normalizedFullName,
          business_name: normalizedBusinessName,
        })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (profileError || !updatedProfile) {
        toast({
          title: "ذخیره پروفایل انجام نشد",
          description: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      profileSaved = true;
      const updatedDetails = {
        fullName: normalizedFullName,
        businessName: normalizedBusinessName,
      };
      setDraftFullName(normalizedFullName);
      setDraftBusinessName(normalizedBusinessName);
      setSavedFullName(normalizedFullName);
      setSavedBusinessName(normalizedBusinessName);
      onProfileUpdated(updatedDetails);

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          full_name: normalizedFullName,
          business_name: normalizedBusinessName,
        },
      });

      toast({
        title: "تغییرات پروفایل ذخیره شد",
        description: metadataError
          ? "اطلاعات ذخیره شد، اما همگام‌سازی حساب کامل نشد."
          : "نام شما و کسب‌وکارتان به‌روزرسانی شد.",
        variant: metadataError ? "warning" : "success",
      });
    } catch {
      toast({
        title: profileSaved
          ? "تغییرات پروفایل ذخیره شد"
          : "ذخیره پروفایل انجام نشد",
        description: profileSaved
          ? "اطلاعات ذخیره شد، اما همگام‌سازی حساب کامل نشد."
          : "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
        variant: profileSaved ? "warning" : "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
        className="h-[min(42rem,calc(100dvh-2.5rem))] overflow-hidden p-0"
      >
        <div className="flex h-full min-h-0 flex-col md:flex-row">
          <aside className="shrink-0 border-b border-line bg-surface/55 p-4 backdrop-blur-2xl sm:p-5 md:w-64 md:border-b-0 md:border-e md:px-4 md:py-6">
            <ModalHeader className="mb-5 pe-10 md:mb-7 md:pe-0">
              <ModalTitle>تنظیمات</ModalTitle>
              <ModalDescription className="sr-only">
                تنظیمات حساب پشتیبان
              </ModalDescription>
            </ModalHeader>

            <nav aria-label="بخش‌های تنظیمات">
              <ul className="space-y-1">
                {SECTIONS.map((section) => {
                  const active = activeSection === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => setActiveSection(section.id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                          active
                            ? "bg-card/70 text-foreground"
                            : "text-muted hover:bg-card/40 hover:text-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-xl",
                            active ? "bg-accent/15 text-accent" : "bg-transparent"
                          )}
                        >
                          <section.icon className="size-4" aria-hidden />
                        </span>
                        <span className="truncate text-sm font-medium">
                          {section.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <section
            aria-labelledby={headingId}
            className="flex min-h-0 min-w-0 flex-1 bg-background"
          >
            {activeSection === "profile" && (
              <form
                onSubmit={saveProfile}
                noValidate
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-10">
                  <header className="pe-10">
                    <h2 id={headingId} className="text-xl font-bold">
                      اطلاعات شما
                    </h2>
                    <p className="mt-1.5 text-sm leading-7 text-muted">
                      نامی که در داشبورد می‌بینید و نام صاحب حساب را اینجا تغییر دهید.
                    </p>
                  </header>

                  <div className="mt-7 rounded-3xl border border-line bg-surface/35 p-5 sm:p-6">
                    <div className="grid gap-5 lg:grid-cols-2">
                      <Input
                        id="settings-business-name"
                        label="نام کسب‌وکار"
                        hint="همین نام در منوی داشبورد نمایش داده می‌شود."
                        value={draftBusinessName}
                        onChange={(event) => {
                          setDraftBusinessName(event.target.value);
                          if (businessNameError) setBusinessNameError("");
                        }}
                        error={businessNameError}
                        startIcon={<Building2 />}
                        autoComplete="organization"
                        minLength={2}
                        maxLength={100}
                        disabled={saving}
                        required
                      />
                      <Input
                        id="settings-full-name"
                        label="نام شما"
                        hint="برای شناسایی صاحب این حساب استفاده می‌شود."
                        value={draftFullName}
                        onChange={(event) => {
                          setDraftFullName(event.target.value);
                          if (fullNameError) setFullNameError("");
                        }}
                        error={fullNameError}
                        startIcon={<UserRound />}
                        autoComplete="name"
                        minLength={3}
                        maxLength={80}
                        disabled={saving}
                        required
                      />
                    </div>

                    <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-background/55 p-4 sm:flex-row sm:items-center">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
                          <Mail className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs text-muted">ایمیل ورود</span>
                          <span
                            dir="ltr"
                            className="mt-0.5 block break-all text-start text-sm font-medium"
                          >
                            {email || "—"}
                          </span>
                        </span>
                      </span>
                      <span className="text-xs leading-6 text-muted sm:ms-auto sm:max-w-48">
                        این همان ایمیلی است که با آن وارد می‌شوید و فعلاً قابل تغییر نیست.
                      </span>
                    </div>
                  </div>
                </div>

                <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-line bg-surface/30 px-5 py-4 sm:px-7 lg:px-10">
                  <Button
                    type="submit"
                    className="flex-1 sm:flex-none"
                    loading={saving}
                    disabled={!hasChanges}
                  >
                    ذخیره تغییرات
                  </Button>
                </footer>
              </form>
            )}

            {activeSection === "connections" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-10">
                  <header className="pe-10">
                    <h2 id={headingId} className="text-xl font-bold">
                      اتصالات
                    </h2>
                    <p className="mt-1.5 text-sm leading-7 text-muted">
                      کانال‌های پشتیبانی خود را به پشتیبان متصل کنید.
                    </p>
                  </header>

                  <div className="mt-7 rounded-3xl border border-line bg-surface/35 p-5 sm:p-6">
                    <div className="mb-5 flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <Send className="size-5" aria-hidden />
                      </span>
                      <div>
                        <p className="text-sm font-bold">تلگرام</p>
                        <p className="text-xs text-muted">
                          اتصال ربات پیام‌رسان تلگرام
                        </p>
                      </div>
                    </div>

                    <ConnectionFlow />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </ModalContent>
    </Modal>
  );
};
