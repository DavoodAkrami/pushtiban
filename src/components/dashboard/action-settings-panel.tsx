"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ShieldCheck, UserCheck } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type ActionSettingsItem = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  registryRequiresVerification: boolean;
  registryRequiresConfirmation: boolean;
  requireConfirmation: boolean;
};

type ActionSettingsResponse = {
  actions?: ActionSettingsItem[];
  action?: ActionSettingsItem;
  error?: string;
  setupRequired?: boolean;
};

export const ActionSettingsPanel = () => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const [actions, setActions] = React.useState<ActionSettingsItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [setupRequired, setSetupRequired] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/ai/actions", { cache: "no-store" });
        const result = (await response.json().catch(() => ({}))) as ActionSettingsResponse;
        if (!response.ok || !Array.isArray(result.actions)) {
          throw new Error(result.error || "تنظیمات اقدامات بارگذاری نشد.");
        }
        setActions(result.actions);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "تنظیمات اقدامات بارگذاری نشد."
        );
      }
    };
    void load();
  }, []);

  const save = async (
    previous: ActionSettingsItem,
    next: ActionSettingsItem
  ) => {
    setActions((current) =>
      current?.map((item) => (item.key === next.key ? next : item)) ?? null
    );
    setSavingKey(next.key);
    try {
      const response = await fetch("/api/ai/actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionKey: next.key,
          enabled: next.enabled,
          // A registry-required confirmation is never sent as an owner choice.
          requireConfirmation: next.registryRequiresConfirmation
            ? false
            : next.requireConfirmation,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ActionSettingsResponse;
      if (!response.ok || !result.action) {
        setSetupRequired(result.setupRequired === true);
        throw new Error(result.error || "تنظیمات اقدام ذخیره نشد.");
      }
      setActions((current) =>
        current?.map((item) => (item.key === next.key ? result.action! : item)) ?? null
      );
      toast({
        title: result.action.enabled ? "اقدام فعال شد" : "اقدام غیرفعال شد",
        description: result.action.name,
        variant: "success",
      });
    } catch (saveError) {
      setActions((current) =>
        current?.map((item) => (item.key === previous.key ? previous : item)) ?? null
      );
      toast({
        title: "تغییر تنظیم ذخیره نشد",
        description:
          saveError instanceof Error ? saveError.message : "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-line bg-surface/25 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Icon icon={ShieldCheck} tile size="md" tone="accent" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">کنترل اقدامات</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
              فقط اقدام‌های ثبت‌شده در پشتیبان اینجا دیده می‌شوند. شما می‌توانید
              آن‌ها را محدودتر کنید، اما نمی‌توانید لایه‌های امنیتی الزامی را کم کنید.
            </p>
          </div>
        </div>
      </section>

      {setupRequired && (
        <Alert
          variant="warning"
          title="راه‌اندازی اقدامات کامل نشده است"
          description="آخرین فایل ai-actions.sql را در Supabase اجرا کنید تا این تنظیمات ذخیره شوند."
        />
      )}
      {error && (
        <Alert variant="error" title="تنظیمات اقدامات در دسترس نیست" description={error} />
      )}

      {actions === null && !error ? (
        <div className="flex justify-center py-10" role="status" aria-label="در حال بارگذاری">
          <Spinner />
        </div>
      ) : (
        actions?.map((action) => (
          <ActionCard
            key={action.key}
            action={action}
            saving={savingKey === action.key}
            disabled={Boolean(error) || setupRequired}
            reduce={reduce}
            onChange={(next) => void save(action, next)}
          />
        ))
      )}
    </div>
  );
};

const ActionCard = ({
  action,
  saving,
  disabled,
  reduce,
  onChange,
}: {
  action: ActionSettingsItem;
  saving: boolean;
  disabled: boolean;
  reduce: boolean;
  onChange: (action: ActionSettingsItem) => void;
}) => {
  const titleId = React.useId();
  const confirmationIsLocked = action.registryRequiresConfirmation;
  const confirmationState = confirmationIsLocked
    ? "الزامی از طرف سامانه"
    : action.requireConfirmation
      ? "به انتخاب شما فعال است"
      : "اختیاری";

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-surface/40 p-5 transition-colors duration-300 sm:p-6",
        action.enabled ? "border-accent/30" : "border-line"
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 start-0 w-1 bg-accent"
        initial={false}
        animate={{ opacity: action.enabled ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.25, ease: luxe }}
      />
      <div className="flex items-start gap-4">
        <Icon
          icon={ShieldCheck}
          tile
          size="md"
          tone={action.enabled ? "accent" : "muted"}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="font-bold">{action.name}</h2>
            <Badge variant={action.enabled ? "success" : "muted"} dot>
              {action.enabled ? "فعال" : "غیرفعال"}
            </Badge>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            {action.description}
          </p>
        </div>
        <Switch
          checked={action.enabled}
          disabled={disabled || saving}
          aria-label={`${action.enabled ? "غیرفعال کردن" : "فعال کردن"} ${action.name}`}
          aria-busy={saving}
          onChange={(event) => onChange({ ...action, enabled: event.target.checked })}
        />
      </div>

      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <SecurityRule
          icon={UserCheck}
          label="تأیید هویت مشتری"
          value={
            action.registryRequiresVerification
              ? "الزامی از طرف سامانه"
              : "برای این اقدام لازم نیست"
          }
        />
        <SecurityRule
          icon={Check}
          label="تأیید نهایی مشتری"
          value={confirmationState}
          control={
            !confirmationIsLocked ? (
              <Switch
                checked={action.requireConfirmation}
                disabled={disabled || saving || !action.enabled}
                aria-label={`الزام تأیید نهایی برای ${action.name}`}
                onChange={(event) =>
                  onChange({ ...action, requireConfirmation: event.target.checked })
                }
              />
            ) : undefined
          }
        />
      </div>
    </section>
  );
};

const SecurityRule = ({
  icon,
  label,
  value,
  control,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  control?: React.ReactNode;
}) => (
  <div className="flex items-center gap-3 rounded-2xl bg-background/45 p-3">
    <Icon icon={icon} size="sm" tone="muted" />
    <div className="min-w-0 flex-1">
      <p className="text-xs font-bold">{label}</p>
      <p className="mt-0.5 text-xs leading-5 text-muted">{value}</p>
    </div>
    {control}
  </div>
);
