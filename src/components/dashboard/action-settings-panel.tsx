"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpLeft, Check, Database, ShieldCheck, UserCheck } from "lucide-react";
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
import { buttonVariants } from "@/components/ui/button-variants";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
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
  prerequisite: ActionPrerequisite | null;
};

type ActionConfiguration = {
  collectionId: string;
  relatedCollectionId: string | null;
  fieldMapping: Record<string, string>;
  cancellationValue: string | null;
  initialStatus: string | null;
  destination: "internal_business_data" | "external_supabase";
  stockTrackingEnabled: boolean;
  customerFields: Array<{
    slot: string;
    label: string;
    type: string;
    required: boolean;
    options: string[];
  }>;
};

type ActionConfigurationUpdate = Pick<
  ActionConfiguration,
  "collectionId" | "relatedCollectionId"
>;

type ActionPrerequisite = {
  code: string;
  statusLabel: string;
  message: string;
  missingFields: string[];
  datasetRequirements: Array<{
    label: string;
    cta: { label: string; href: string };
  }>;
  cta: { label: string; href: string } | null;
};

type ActionCatalogCollection = {
  id: string;
  name: string;
  kind: string;
  accessScope: string;
  aiEnabled: boolean;
  source: { name: string; tableName: string } | null;
  privateAccessReady: boolean;
};

type ActionConfigurationSpec = {
  primaryLabel: string;
  primaryKinds: string[];
  primaryAccessScopes?: string[];
  relatedLabel?: string;
  relatedKinds?: string[];
  relatedAccessScopes?: string[];
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
    configuration?: ActionConfigurationUpdate
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
    configuration?: ActionConfigurationUpdate
  ) => void;
}) => {
  const titleId = React.useId();
  const confirmationIsLocked = action.registryRequiresConfirmation;
  const confirmationState = confirmationIsLocked
    ? "الزامی از طرف سامانه"
    : action.requireConfirmation
      ? "به انتخاب شما فعال است"
      : "اختیاری";
  const statusLabel = action.enabled
    ? "فعال"
    : action.configurationRequired
      ? action.capabilityAvailable
        ? "آماده فعال‌سازی"
        : action.prerequisite?.statusLabel ?? "نیاز به تکمیل تنظیمات"
      : "غیرفعال";

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
            <Badge
              variant={
                action.enabled
                  ? "success"
                  : action.configurationRequired && !action.capabilityAvailable
                    ? "warning"
                    : "muted"
              }
              dot
            >
              {statusLabel}
            </Badge>
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

      {!action.capabilityAvailable &&
        action.prerequisite &&
        action.prerequisite.datasetRequirements.length > 0 && (
          <div className="mt-5 rounded-2xl border border-warning/20 bg-warning/10 p-4">
            <p className="text-sm font-bold text-warning">{action.prerequisite.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {action.prerequisite.datasetRequirements.map((requirement) => (
                <Link
                  key={requirement.label}
                  href={requirement.cta.href}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {requirement.cta.label}
                  <ArrowUpLeft className="size-4" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        )}

      {action.configurationRequired && configurationSpec && (
        <ActionConfigurationEditor
          key={`${action.key}:${JSON.stringify(action.configuration)}`}
          action={action}
          catalog={catalog}
          configurationSpec={configurationSpec}
          prerequisite={action.prerequisite}
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
  prerequisite,
  disabled,
  saving,
  onSave,
}: {
  action: ActionSettingsItem;
  catalog: ActionCatalogCollection[];
  configurationSpec: ActionConfigurationSpec;
  prerequisite: ActionPrerequisite | null;
  disabled: boolean;
  saving: boolean;
  onSave: (configuration: ActionConfigurationUpdate) => void;
}) => {
  const primaryCandidates = catalog.filter(
    (collection) =>
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
  const configuredRelatedId = action.configuration?.relatedCollectionId;
  const initialRelatedId = relatedCandidates.some(
    (collection) => collection.id === configuredRelatedId
  )
    ? configuredRelatedId ?? null
    : relatedCandidates.length === 1
      ? relatedCandidates[0].id
      : null;
  const [draft, setDraft] = React.useState<ActionConfigurationUpdate>(() => ({
    collectionId: primaryCandidates.some(
      (collection) => collection.id === action.configuration?.collectionId
    )
      ? action.configuration?.collectionId ?? ""
      : "",
    relatedCollectionId: initialRelatedId,
  }));
  const primary = primaryCandidates.find(
    (collection) => collection.id === draft.collectionId
  );
  const effectiveRelatedId =
    draft.relatedCollectionId ??
    (relatedCandidates.length === 1 ? relatedCandidates[0].id : null);
  const related = relatedCandidates.find(
    (collection) => collection.id === effectiveRelatedId
  );
  const needsRelatedCollection = Boolean(configurationSpec.relatedKinds);
  const complete = Boolean(primary) && (!needsRelatedCollection || Boolean(related));
  const customerFields =
    action.configuration?.collectionId === draft.collectionId &&
    action.configuration.relatedCollectionId === effectiveRelatedId
      ? action.configuration.customerFields
      : [];

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={
        action.capabilityAvailable || prerequisite?.datasetRequirements.length
          ? undefined
          : "configuration"
      }
      className="mt-5 border-t border-line pt-4"
    >
      <AccordionItem
        value="configuration"
        id={`action-${action.key}-configuration`}
        className="rounded-2xl border border-line bg-background/35 px-4 shadow-none"
      >
        <AccordionTrigger className="py-4 text-sm hover:text-foreground">
          <span className="flex items-center gap-2">
            <Database className="size-4 text-muted" aria-hidden />
            اتصال مجموعه‌داده
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-5 pb-4">
          <p className="max-w-2xl text-sm leading-7 text-muted">
            مجموعه‌ای را که این اقدام باید با آن کار کند انتخاب کنید. پشتیبان ساختار
            آن را بررسی می‌کند و هنگام گفتگو، اطلاعات لازم را به‌صورت خودکار از
            مشتری می‌پرسد.
          </p>

          {!action.capabilityAvailable &&
            prerequisite &&
            prerequisite.datasetRequirements.length === 0 && (
              <div className="rounded-2xl bg-warning/10 p-4 text-sm leading-7 text-warning">
                <p>{prerequisite.message}</p>
                {prerequisite.missingFields.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 ps-5">
                    {prerequisite.missingFields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                )}
                {prerequisite.cta && (
                  <Link
                    href={prerequisite.cta.href}
                    className={buttonVariants({
                      variant: "link",
                      size: "sm",
                      className: "mt-3 px-0 text-warning",
                    })}
                  >
                    {prerequisite.cta.label}
                    <ArrowUpLeft className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            )}

          {primaryCandidates.length > 0 && (
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
                      : "داده‌های پشتیبان",
                  }))}
                  onChange={(collectionId) =>
                    setDraft((current) => ({ ...current, collectionId }))
                  }
                />
                {action.key === "create_order" &&
                  relatedCandidates.length > 1 && (
                    <Select
                      id={`${action.key}-related-collection`}
                      label={configurationSpec.relatedLabel ?? "مجموعه محصولات"}
                      value={effectiveRelatedId ?? ""}
                      disabled={disabled}
                      searchable={relatedCandidates.length > 6}
                      options={relatedCandidates.map((collection) => ({
                        value: collection.id,
                        label: collection.name,
                      }))}
                      onChange={(relatedCollectionId) =>
                        setDraft((current) => ({
                          ...current,
                          relatedCollectionId: relatedCollectionId || null,
                        }))
                      }
                    />
                  )}
              </div>

              {action.key === "create_order" &&
                relatedCandidates.length === 1 &&
                related && (
                <div className="flex items-center gap-3 rounded-2xl bg-surface/55 px-4 py-3 text-sm">
                  <Icon icon={Database} size="sm" tone="muted" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted">مجموعه محصولات متصل‌شده</p>
                    <p className="mt-0.5 truncate font-medium">{related.name}</p>
                  </div>
                </div>
              )}

              {customerFields.length > 0 && (
                <div className="rounded-2xl border border-line bg-background/35 p-4">
                  <p className="text-xs font-bold text-muted">
                    اطلاعاتی که دستیار از مشتری می‌پرسد
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {customerFields.map((field) => (
                      <Badge key={field.slot} variant="muted">
                        {field.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
                <p className="text-xs leading-6 text-muted">
                  فیلدهای سیستمی، وضعیت‌ها و کنترل موجودی بر اساس ساختار مجموعه
                  تنظیم می‌شوند.
                </p>
                <Button
                  type="button"
                  size="sm"
                  loading={saving}
                  disabled={disabled || !complete}
                  onClick={() =>
                    onSave({
                      collectionId: draft.collectionId,
                      relatedCollectionId: effectiveRelatedId,
                    })
                  }
                >
                  ذخیره اتصال
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
