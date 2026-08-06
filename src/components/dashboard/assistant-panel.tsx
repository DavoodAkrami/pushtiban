"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Bot, Send, Users, type LucideIcon } from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import { luxe } from "@/components/motion/reveal";
import { AssistantPreviewPane } from "@/components/dashboard/assistant/preview-pane";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/checkbox";
import { Icon, type AppIcon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ---- Types ----------------------------------------------------------------

type AssistantPanelProps = {
  initialEnabled: boolean;
  initialHumanHandoff: boolean;
  initialTelegramEnabled: boolean;
  initialInstagramEnabled: boolean;
  /** False until supabase/channel-inbox.sql has added the two columns. */
  channelSwitchesReady: boolean;
  telegramConnected: boolean;
  instagramConnected: boolean;
  loadError: boolean;
  providerConfigured: boolean;
  setupRequired: boolean;
};

type SettingsResponse = {
  enabled?: boolean;
  humanHandoff?: boolean;
  telegramEnabled?: boolean;
  instagramEnabled?: boolean;
  error?: string;
};

// ---- Assistant status and behaviour ---------------------------------------

export const AssistantPanel = ({
  initialEnabled,
  initialHumanHandoff,
  initialTelegramEnabled,
  initialInstagramEnabled,
  channelSwitchesReady,
  telegramConnected,
  instagramConnected,
  loadError,
  providerConfigured,
  setupRequired,
}: AssistantPanelProps) => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [saving, setSaving] = React.useState(false);
  const [humanHandoff, setHumanHandoff] = React.useState(initialHumanHandoff);
  const [savingHandoff, setSavingHandoff] = React.useState(false);
  const [telegramEnabled, setTelegramEnabled] = React.useState(
    initialTelegramEnabled
  );
  const [instagramEnabled, setInstagramEnabled] = React.useState(
    initialInstagramEnabled
  );
  const [savingChannel, setSavingChannel] = React.useState<
    "telegram" | "instagram" | null
  >(null);

  // The assistant on/off toggle also needs a configured provider; the handoff
  // toggle only routes to humans, so it needs neither a provider nor anything
  // beyond the settings table being reachable.
  const unavailable = setupRequired || loadError || !providerConfigured;
  const handoffUnavailable = setupRequired || loadError;

  const updateEnabled = async (nextEnabled: boolean) => {
    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    setSaving(true);

    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const result = (await response.json().catch(() => ({}))) as SettingsResponse;

      if (!response.ok || typeof result.enabled !== "boolean") {
        throw new Error(
          result.error || "وضعیت دستیار ذخیره نشد؛ دوباره تلاش کنید."
        );
      }

      setEnabled(result.enabled);
      toast({
        title: result.enabled
          ? "دستیار هوش مصنوعی روشن شد"
          : "دستیار هوش مصنوعی خاموش شد",
        description: result.enabled
          ? "پرسش‌های بدون پاسخ آماده به دستیار سپرده می‌شوند."
          : "دیگر هیچ پیام عادی به هوش مصنوعی فرستاده نمی‌شود.",
        variant: "success",
      });
    } catch (error) {
      setEnabled(previousEnabled);
      toast({
        title: "تغییر وضعیت ذخیره نشد",
        description: error instanceof Error ? error.message : "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * One channel's switch. The master toggle decides whether the assistant runs
   * at all; these decide where it answers, so turning one off leaves the flows
   * and prepared replies on that channel working exactly as they were.
   */
  const updateChannel = async (
    channel: "telegram" | "instagram",
    next: boolean
  ) => {
    const isTelegram = channel === "telegram";
    const setLocal = isTelegram ? setTelegramEnabled : setInstagramEnabled;
    const previous = isTelegram ? telegramEnabled : instagramEnabled;
    const label = isTelegram ? "تلگرام" : "اینستاگرام";

    setLocal(next);
    setSavingChannel(channel);

    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isTelegram ? { telegramEnabled: next } : { instagramEnabled: next }
        ),
      });
      const result = (await response.json().catch(() => ({}))) as SettingsResponse;
      const saved = isTelegram ? result.telegramEnabled : result.instagramEnabled;

      if (!response.ok || typeof saved !== "boolean") {
        throw new Error(result.error || "تنظیم کانال ذخیره نشد؛ دوباره تلاش کنید.");
      }

      setLocal(saved);
      toast({
        title: saved
          ? `پاسخ‌گویی دستیار در ${label} روشن شد`
          : `پاسخ‌گویی دستیار در ${label} خاموش شد`,
        description: saved
          ? `پیام‌های بی‌پاسخ ${label} به دستیار سپرده می‌شوند.`
          : `پیام‌های ${label} دیگر به دستیار نمی‌رسند؛ فلوها و کلیدواژه‌ها سر جای خود می‌مانند.`,
        variant: "success",
      });
    } catch (error) {
      setLocal(previous);
      toast({
        title: "تغییر تنظیم ذخیره نشد",
        description: error instanceof Error ? error.message : "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setSavingChannel(null);
    }
  };

  const updateHandoff = async (nextHandoff: boolean) => {
    const previous = humanHandoff;
    setHumanHandoff(nextHandoff);
    setSavingHandoff(true);

    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ humanHandoff: nextHandoff }),
      });
      const result = (await response.json().catch(() => ({}))) as SettingsResponse;

      if (!response.ok || typeof result.humanHandoff !== "boolean") {
        throw new Error(
          result.error || "تنظیم ارجاع ذخیره نشد؛ دوباره تلاش کنید."
        );
      }

      setHumanHandoff(result.humanHandoff);
      toast({
        title: result.humanHandoff
          ? "ارجاع به پشتیبان روشن شد"
          : "ارجاع به پشتیبان خاموش شد",
        description: result.humanHandoff
          ? "پرسش‌های بی‌پاسخ و درخواست‌های مستقیم مشتری به شما و ادمین‌ها می‌رسد."
          : "دیگر هیچ پیامی به پشتیبان انسانی ارجاع نمی‌شود.",
        variant: "success",
      });
    } catch (error) {
      setHumanHandoff(previous);
      toast({
        title: "تغییر تنظیم ذخیره نشد",
        description: error instanceof Error ? error.message : "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setSavingHandoff(false);
    }
  };

  return (
    <div className="space-y-4">
      {setupRequired && (
        <Alert
          variant="warning"
          title="راه‌اندازی پایگاه داده کامل نشده است"
          description="اسکریپت تنظیمات دستیار را اجرا کنید تا کلیدها فعال شوند."
        />
      )}
      {!setupRequired && loadError && (
        <Alert
          variant="error"
          title="وضعیت دستیار بارگذاری نشد"
          description="صفحه را تازه کنید و دوباره تلاش کنید."
        />
      )}
      {!providerConfigured && (
        <Alert
          variant="warning"
          title="ارائه‌دهنده هوش مصنوعی تنظیم نشده است"
          description="برای روشن کردن دستیار، کلید NVIDIA NIM یا OpenAI را در سرور تنظیم کنید."
        />
      )}

      <ToggleCard
        icon={Bot}
        title="پاسخ‌گویی هوشمند"
        description="وقتی روشن باشد، پیام‌های عادی که با فلو یا کلیدواژه فعال تطبیق ندارند به دستیار فرستاده می‌شوند. فرمان‌های تلگرام هرگز به هوش مصنوعی فرستاده نمی‌شوند."
        badgeOn="روشن"
        badgeOff="خاموش"
        ariaLabel="روشن کردن دستیار هوش مصنوعی"
        enabled={enabled}
        saving={saving}
        disabled={saving || unavailable}
        reduce={reduce}
        onToggle={updateEnabled}
      />

      {/* Everything below the master toggle appears only when the assistant
          is on. */}
      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div
            key="assistant-body"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
            className="space-y-4"
          >
            {/* Where the assistant answers. Only connected channels appear:
                a switch for a channel the business has not connected would be
                a setting with nothing to apply it to. */}
            {channelSwitchesReady && (telegramConnected || instagramConnected) && (
              <section className="rounded-3xl border border-line bg-surface/40 p-5 sm:p-6">
                <h2 className="font-bold">کانال‌های پاسخ‌گویی</h2>
                <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
                  مشخص کنید دستیار روی کدام کانال‌ها جواب بدهد. خاموش کردن یک
                  کانال، فلوها و پاسخ‌های آمادهٔ همان کانال را متوقف نمی‌کند.
                </p>

                <div className="mt-4 space-y-3">
                  {telegramConnected && (
                    <ChannelSwitch
                      icon={Send}
                      title="تلگرام"
                      description="پیام‌های عادی ربات تلگرام که فلو یا کلیدواژه‌ای جوابشان نداده."
                      enabled={telegramEnabled}
                      disabled={savingChannel !== null || handoffUnavailable}
                      saving={savingChannel === "telegram"}
                      onToggle={(next) => void updateChannel("telegram", next)}
                    />
                  )}
                  {instagramConnected && (
                    <ChannelSwitch
                      icon={TbBrandInstagram}
                      title="اینستاگرام"
                      description="دایرکت‌های مشتری که فلو، کلیدواژه یا قانون استوری جوابشان نداده."
                      enabled={instagramEnabled}
                      disabled={savingChannel !== null || handoffUnavailable}
                      saving={savingChannel === "instagram"}
                      onToggle={(next) => void updateChannel("instagram", next)}
                    />
                  )}
                </div>
              </section>
            )}

            <ToggleCard
              icon={Users}
              title="ارجاع به پشتیبان انسانی"
              description="وقتی روشن باشد، دستیار می‌تواند پرسش‌هایی را که پاسخشان را نمی‌داند — و درخواست‌های مستقیم مشتری برای گفتگو با انسان — پس از تأیید مشتری به شما و ادمین‌ها بفرستد. وقتی خاموش باشد، هیچ پیامی ارجاع نمی‌شود."
              badgeOn="روشن"
              badgeOff="خاموش"
              ariaLabel="روشن کردن ارجاع به پشتیبان انسانی"
              enabled={humanHandoff}
              saving={savingHandoff}
              disabled={savingHandoff || handoffUnavailable}
              reduce={reduce}
              onToggle={updateHandoff}
            />

            {/* Who receives an escalation is bot configuration, not assistant
                behaviour — it lives on the Telegram bot page. */}
            <AnimatePresence initial={false}>
              {humanHandoff && (
                <motion.div
                  key="handoff-recipients"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
                >
                  <Link
                    href="/dashboard/bot/admins"
                    className="group flex items-start gap-4 rounded-3xl border border-line bg-surface/25 p-5 transition-colors duration-300 hover:border-accent/30 hover:bg-surface/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:p-6"
                  >
                    <Icon icon={Users} tile size="sm" tone="muted" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">گیرندگان پیام‌های ارجاع‌شده</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        تلگرام شخصی خود را وصل کنید و ادمین‌ها را اضافه کنید تا
                        پرسش‌های ارجاع‌شده به دستشان برسد.
                      </p>
                    </div>
                    <ArrowLeft
                      className="size-4 shrink-0 text-muted transition-transform duration-300 group-hover:-translate-x-1 group-hover:text-accent"
                      aria-hidden
                    />
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AssistantPreviewPane enabled={enabled} />
    </div>
  );
};

// ---- One channel's row ----------------------------------------------------

const ChannelSwitch = ({
  icon,
  title,
  description,
  enabled,
  disabled,
  saving,
  onToggle,
}: {
  icon: AppIcon;
  title: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  saving: boolean;
  onToggle: (next: boolean) => void;
}) => (
  <div className="flex items-start gap-3 rounded-2xl border border-line bg-background/45 p-4">
    <Icon
      icon={icon}
      tile
      size="sm"
      tone={enabled ? "accent" : "muted"}
      className="shrink-0"
    />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <Badge variant={enabled ? "success" : "muted"} dot>
          {enabled ? "روشن" : "خاموش"}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-6 text-muted">{description}</p>
    </div>
    <Switch
      checked={enabled}
      disabled={disabled}
      aria-label={`پاسخ‌گویی دستیار در ${title}`}
      aria-busy={saving}
      onChange={(event) => onToggle(event.target.checked)}
    />
  </div>
);

// ---- Reusable setting toggle card -----------------------------------------

type ToggleCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  badgeOn: string;
  badgeOff: string;
  ariaLabel: string;
  enabled: boolean;
  saving: boolean;
  disabled: boolean;
  reduce: boolean;
  onToggle: (next: boolean) => void;
};

const ToggleCard = ({
  icon,
  title,
  description,
  badgeOn,
  badgeOff,
  ariaLabel,
  enabled,
  saving,
  disabled,
  reduce,
  onToggle,
}: ToggleCardProps) => {
  const titleId = React.useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-surface/40 p-5 transition-colors duration-300 sm:p-6",
        enabled ? "border-accent/30" : "border-line"
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 start-0 w-1 bg-accent"
        initial={false}
        animate={{ opacity: enabled ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.25, ease: luxe }}
      />
      <div className="flex items-start gap-4">
        <Icon
          icon={icon}
          tile
          size="md"
          tone={enabled ? "accent" : "muted"}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="font-bold">
              {title}
            </h2>
            <Badge variant={enabled ? "success" : "muted"} dot>
              {enabled ? badgeOn : badgeOff}
            </Badge>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            {description}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-busy={saving}
          onChange={(event) => void onToggle(event.target.checked)}
        />
      </div>
    </section>
  );
};
