"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Database, ShieldCheck, UserCheck } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  capabilityAvailable: boolean;
  configurationRequired: boolean;
  configuration: ActionConfiguration | null;
};

type ActionConfiguration = {
  collectionId: string;
  relatedCollectionId: string | null;
  fieldMapping: Record<string, string>;
  cancellationValue: string | null;
};

type ActionCatalogCollection = {
  id: string;
  name: string;
  kind: string;
  accessScope: string;
  aiEnabled: boolean;
  fields: Array<{ key: string; label: string; type: string; role: string }>;
  source: { id: string; name: string; tableName: string } | null;
  privateAccessReady: boolean;
};

type ActionConfigurationSpec = {
  primaryLabel: string;
  primaryKinds: string[];
  primaryAccessScopes?: string[];
  relatedLabel?: string;
  relatedKinds?: string[];
  relatedAccessScopes?: string[];
  fields: Array<{
    key: string;
    label: string;
    side: "primary" | "related";
    required: boolean;
    types: string[];
  }>;
  cancellationValue?: boolean;
};

type ActionSettingsResponse = {
  actions?: ActionSettingsItem[];
  action?: ActionSettingsItem;
  error?: string;
  setupRequired?: boolean;
  catalog?: ActionCatalogCollection[];
  configurationSpecs?: Record<string, ActionConfigurationSpec>;
};

export const ActionSettingsPanel = () => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const [actions, setActions] = React.useState<ActionSettingsItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [setupRequired, setSetupRequired] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [catalog, setCatalog] = React.useState<ActionCatalogCollection[]>([]);
  const [configurationSpecs, setConfigurationSpecs] = React.useState<
    Record<string, ActionConfigurationSpec>
  >({});

  React.useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/ai/actions", { cache: "no-store" });
        const result = (await response.json().catch(() => ({}))) as ActionSettingsResponse;
        if (!response.ok || !Array.isArray(result.actions)) {
          throw new Error(result.error || "تنظیمات اقدامات بارگذاری نشد.");
        }
        setActions(result.actions);
        setCatalog(Array.isArray(result.catalog) ? result.catalog : []);
        setConfigurationSpecs(result.configurationSpecs ?? {});
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
    next: ActionSettingsItem,
    configuration?: ActionConfiguration
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
          ...(configuration ? { configuration } : {}),
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
        title: configuration
          ? "پیکربندی ذخیره شد"
          : result.action.enabled
            ? "اقدام فعال شد"
            : "اقدام غیرفعال شد",
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
            catalog={catalog}
            configurationSpec={configurationSpecs[action.key]}
            onChange={(next, configuration) =>
              void save(action, next, configuration)
            }
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
  catalog,
  configurationSpec,
  onChange,
}: {
  action: ActionSettingsItem;
  saving: boolean;
  disabled: boolean;
  reduce: boolean;
  catalog: ActionCatalogCollection[];
  configurationSpec?: ActionConfigurationSpec;
  onChange: (
    action: ActionSettingsItem,
    configuration?: ActionConfiguration
  ) => void;
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
            {action.configurationRequired && !action.capabilityAvailable && (
              <Badge variant="warning">نیاز به پیکربندی</Badge>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            {action.description}
          </p>
        </div>
        <Switch
          checked={action.enabled}
          disabled={
            disabled ||
            saving ||
            (action.configurationRequired && !action.capabilityAvailable)
          }
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

      {action.configurationRequired && configurationSpec && (
        <ActionConfigurationEditor
          key={`${action.key}:${JSON.stringify(action.configuration)}`}
          action={action}
          catalog={catalog}
          configurationSpec={configurationSpec}
          disabled={disabled || saving}
          saving={saving}
          onSave={(configuration) => onChange(action, configuration)}
        />
      )}
    </section>
  );
};

const ActionConfigurationEditor = ({
  action,
  catalog,
  configurationSpec,
  disabled,
  saving,
  onSave,
}: {
  action: ActionSettingsItem;
  catalog: ActionCatalogCollection[];
  configurationSpec: ActionConfigurationSpec;
  disabled: boolean;
  saving: boolean;
  onSave: (configuration: ActionConfiguration) => void;
}) => {
  const [draft, setDraft] = React.useState<ActionConfiguration>(() =>
    action.configuration ?? {
      collectionId: "",
      relatedCollectionId: null,
      fieldMapping: {},
      cancellationValue: configurationSpec.cancellationValue ? "cancelled" : null,
    }
  );

  const primaryCandidates = catalog.filter(
    (collection) =>
      Boolean(collection.source) &&
      configurationSpec.primaryKinds.includes(collection.kind) &&
      (!configurationSpec.primaryAccessScopes ||
        configurationSpec.primaryAccessScopes.includes(collection.accessScope)) &&
      (!configurationSpec.primaryAccessScopes?.includes("verified_customer") ||
        (collection.privateAccessReady && collection.aiEnabled))
  );
  const relatedCandidates = configurationSpec.relatedKinds
    ? catalog.filter(
        (collection) =>
          configurationSpec.relatedKinds!.includes(collection.kind) &&
          (!configurationSpec.relatedAccessScopes ||
            configurationSpec.relatedAccessScopes.includes(collection.accessScope)) &&
          collection.aiEnabled
      )
    : [];
  const primary = catalog.find((collection) => collection.id === draft.collectionId);
  const related = catalog.find(
    (collection) => collection.id === draft.relatedCollectionId
  );
  const requiredFields = configurationSpec.fields.filter((field) => field.required);
  const complete =
    Boolean(primary?.source) &&
    (!configurationSpec.relatedKinds || Boolean(related)) &&
    requiredFields.every((field) => Boolean(draft.fieldMapping[field.key])) &&
    (!configurationSpec.cancellationValue ||
      Boolean(draft.cancellationValue?.trim()));

  const updateCollection = (collectionId: string) => {
    const primaryKeys = new Set(
      configurationSpec.fields
        .filter((field) => field.side === "primary")
        .map((field) => field.key)
    );
    setDraft((current) => ({
      ...current,
      collectionId,
      fieldMapping: Object.fromEntries(
        Object.entries(current.fieldMapping).filter(([key]) => !primaryKeys.has(key))
      ),
    }));
  };

  const updateRelatedCollection = (relatedCollectionId: string) => {
    const relatedKeys = new Set(
      configurationSpec.fields
        .filter((field) => field.side === "related")
        .map((field) => field.key)
    );
    setDraft((current) => ({
      ...current,
      relatedCollectionId: relatedCollectionId || null,
      fieldMapping: Object.fromEntries(
        Object.entries(current.fieldMapping).filter(([key]) => !relatedKeys.has(key))
      ),
    }));
  };

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={action.capabilityAvailable ? undefined : "configuration"}
      className="mt-5 border-t border-line pt-4"
    >
      <AccordionItem
        value="configuration"
        className="rounded-2xl border border-line bg-background/35 px-4 shadow-none"
      >
        <AccordionTrigger className="py-4 text-sm hover:text-foreground">
          <span className="flex items-center gap-2">
            <Database className="size-4 text-muted" aria-hidden />
            منبع و فیلدهای عملیات
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-5 pb-4">
          {!primaryCandidates.length ? (
            <p className="rounded-2xl bg-warning/10 p-4 text-sm leading-7 text-warning">
              مجموعه فعال و متصل به Supabase با ساختار مناسب پیدا نشد. ابتدا
              اتصال داده این عملیات را در بخش داده‌های کسب‌وکار آماده کنید.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  id={`${action.key}-primary-collection`}
                  label={configurationSpec.primaryLabel}
                  value={draft.collectionId}
                  disabled={disabled}
                  searchable={primaryCandidates.length > 6}
                  options={primaryCandidates.map((collection) => ({
                    value: collection.id,
                    label: collection.name,
                    description: collection.source
                      ? `${collection.source.name} · ${collection.source.tableName}`
                      : undefined,
                  }))}
                  onChange={updateCollection}
                />
                {configurationSpec.relatedKinds && (
                  <Select
                    id={`${action.key}-related-collection`}
                    label={configurationSpec.relatedLabel}
                    value={draft.relatedCollectionId ?? ""}
                    disabled={disabled}
                    searchable={relatedCandidates.length > 6}
                    options={relatedCandidates.map((collection) => ({
                      value: collection.id,
                      label: collection.name,
                    }))}
                    onChange={updateRelatedCollection}
                  />
                )}
              </div>

              {primary?.source && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-surface/55 px-4 py-3 text-xs text-muted">
                  <span>منبع: {primary.source.name}</span>
                  <span dir="ltr">Table: {primary.source.tableName}</span>
                </div>
              )}

              {(primary || related) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {configurationSpec.fields.map((concept) => {
                    const collection =
                      concept.side === "primary" ? primary : related;
                    if (!collection) return null;
                    return (
                      <Select
                        key={concept.key}
                        id={`${action.key}-${concept.key}`}
                        label={`${concept.label}${concept.required ? "" : " (اختیاری)"}`}
                        value={draft.fieldMapping[concept.key] ?? ""}
                        disabled={disabled}
                        options={[
                          ...(!concept.required
                            ? [{ value: "", label: "استفاده نشود" }]
                            : []),
                          ...collection.fields
                            .filter((field) => concept.types.includes(field.type))
                            .map((field) => ({
                              value: field.key,
                              label: field.label,
                            })),
                        ]}
                        onChange={(fieldKey) =>
                          setDraft((current) => ({
                            ...current,
                            fieldMapping: fieldKey
                              ? {
                                  ...current.fieldMapping,
                                  [concept.key]: fieldKey,
                                }
                              : Object.fromEntries(
                                  Object.entries(current.fieldMapping).filter(
                                    ([key]) => key !== concept.key
                                  )
                                ),
                          }))
                        }
                      />
                    );
                  })}
                </div>
              )}

              {configurationSpec.cancellationValue && (
                <Input
                  id={`${action.key}-cancellation-value`}
                  label="مقدار وضعیت پس از لغو"
                  hint="همان مقداری که سیستم متصل برای وضعیت لغوشده می‌پذیرد."
                  value={draft.cancellationValue ?? ""}
                  disabled={disabled}
                  maxLength={80}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      cancellationValue: event.target.value,
                    }))
                  }
                />
              )}

              <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
                <p className="text-xs leading-6 text-muted">
                  نام جدول و ستون‌ها از تنظیم ذخیره‌شده خوانده می‌شوند و در اختیار
                  دستیار قرار نمی‌گیرند.
                </p>
                <Button
                  type="button"
                  size="sm"
                  loading={saving}
                  disabled={disabled || !complete}
                  onClick={() => onSave(draft)}
                >
                  ذخیره پیکربندی
                </Button>
              </div>
            </>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
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
