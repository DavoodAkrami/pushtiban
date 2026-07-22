"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, SlidersHorizontal } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AiAssistancePanelProps = {
  initialEnabled: boolean;
  loadError: boolean;
  providerConfigured: boolean;
  setupRequired: boolean;
};

type SettingsResponse = {
  enabled?: boolean;
  error?: string;
};

export const AiAssistancePanel = ({
  initialEnabled,
  loadError,
  providerConfigured,
  setupRequired,
}: AiAssistancePanelProps) => {
  const reduce = useReducedMotion();
  const { toast } = useToast();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [saving, setSaving] = React.useState(false);

  const unavailable = setupRequired || loadError || !providerConfigured;

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
        description:
          error instanceof Error
            ? error.message
            : "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-black">دستیار هوش مصنوعی</h1>
        <p className="mt-2 text-sm leading-7 text-muted">
          پاسخ‌گویی هوشمند ربات تلگرام را از اینجا کنترل کنید.
        </p>
      </header>

      <div className="space-y-4">
        {setupRequired && (
          <Alert
            variant="warning"
            title="راه‌اندازی پایگاه داده کامل نشده است"
            description="اسکریپت تنظیمات دستیار را اجرا کنید تا کلید روشن و خاموش فعال شود."
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

        <section
          aria-labelledby="ai-toggle-title"
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
              icon={Bot}
              tile
              size="md"
              tone={enabled ? "accent" : "muted"}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="ai-toggle-title" className="font-bold">
                  پاسخ‌گویی هوشمند
                </h2>
                <Badge variant={enabled ? "success" : "muted"} dot>
                  {enabled ? "روشن" : "خاموش"}
                </Badge>
              </div>
              <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
                وقتی روشن باشد، پیام‌های عادی که با فلو یا کلیدواژه فعال
                تطبیق ندارند به دستیار فرستاده می‌شوند. فرمان‌های تلگرام هرگز
                به هوش مصنوعی فرستاده نمی‌شوند.
              </p>
            </div>
            <Switch
              id="ai-assistant-enabled"
              checked={enabled}
              disabled={saving || unavailable}
              aria-label="روشن کردن دستیار هوش مصنوعی"
              aria-busy={saving}
              onChange={(event) => void updateEnabled(event.target.checked)}
            />
          </div>
        </section>

        <AnimatePresence initial={false}>
          {enabled && (
            <motion.section
              key="assistant-settings"
              aria-labelledby="ai-settings-title"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
              className="rounded-3xl border border-line bg-surface/25 p-5 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <Icon icon={SlidersHorizontal} tile size="sm" tone="muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="ai-settings-title" className="font-bold">
                      تنظیمات دستیار
                    </h2>
                    <Badge variant="muted">به‌زودی</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    نام، لحن، مدل و دیگر تنظیمات دستیار در این بخش قرار
                    می‌گیرند.
                  </p>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
