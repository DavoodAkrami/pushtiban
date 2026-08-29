"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Database,
  Eye,
  FileSpreadsheet,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Waypoints,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Steps } from "@/components/ui/steps";
import { Switch } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  ACCESS_SCOPE_LABELS,
  COLLECTION_STATUS_LABELS,
  AI_EXPOSURE_LABELS,
  FIELD_TYPE_LABELS,
  type BusinessDataCollection,
} from "@/lib/business-data/api-types";
import { businessDataRequest, jsonRequest } from "@/lib/business-data/client";
import {
  getBusinessDataTemplate,
  getOrderedBusinessDataTemplates,
  getRecommendedBusinessDataTemplates,
} from "@/lib/business-data/templates";
import type {
  BusinessDataAccessScope,
  BusinessDataCollectionKind,
  BusinessDataFieldDefinition,
  BusinessDataTemplate,
} from "@/lib/business-data/types";
import { cn, fa } from "@/lib/utils";
import { FieldEditorModal } from "./field-editor-modal";
import { FileImportFlow } from "./file-import-flow";

const CREATION_STEPS = [
  { id: "template", label: "نوع داده" },
  { id: "source", label: "منبع داده" },
  { id: "name", label: "نام مجموعه" },
  { id: "fields", label: "فیلدهای اولیه" },
  { id: "access", label: "دسترسی" },
];

const cloneFieldDefinitions = (
  fields: readonly BusinessDataFieldDefinition[]
): BusinessDataFieldDefinition[] =>
  fields.map((field, position) => ({
    ...field,
    position,
    ...(field.validation
      ? {
          validation: {
            ...field.validation,
            ...(field.validation.options
              ? { options: [...field.validation.options] }
              : {}),
          },
        }
      : {}),
  }));

type CreationSource = "manual" | "csv" | "excel" | "supabase";

const CREATION_SOURCES: Array<{
  value: CreationSource;
  label: string;
  description: string;
  icon: typeof Pencil;
}> = [
  {
    value: "manual",
    label: "ساخت دستی",
    description: "ساختار و رکوردها را داخل پشتیبان مدیریت کنید.",
    icon: Pencil,
  },
  {
    value: "csv",
    label: "فایل CSV",
    description: "ستون‌های فایل را بررسی و به فیلدهای مجموعه تبدیل کنید.",
    icon: FileText,
  },
  {
    value: "excel",
    label: "فایل Excel",
    description: "یک برگه از فایل Excel را وارد و بعداً به‌روزرسانی کنید.",
    icon: FileSpreadsheet,
  },
  {
    value: "supabase",
    label: "Supabase",
    description: "یک جدول Supabase را به مجموعه متصل و همگام کنید.",
    icon: Database,
  },
];

const ACCESS_OPTIONS = [
  {
    value: "public_catalog",
    label: "داده عمومی",
    description: "مثل محصول، منو یا خدماتی که همه مشتریان می‌توانند ببینند.",
  },
  {
    value: "verified_customer",
    label: "فقط مشتری تأییدشده",
    description: "مثل سفارش و رزرو؛ اتصال به دستیار فعلاً غیرفعال می‌ماند.",
  },
  {
    value: "internal",
    label: "فقط داخل کسب‌وکار",
    description: "این داده هیچ‌وقت به دستیار داده نمی‌شود.",
  },
];

const sourceLabel = (collection: BusinessDataCollection) =>
  collection.source?.type === "manual" ? "دستی" : collection.source?.name ?? "—";

const assistantLabel = (collection: BusinessDataCollection) => {
  if (collection.accessScope === "internal") return "همیشه پنهان";
  if (collection.accessScope === "verified_customer") return "نیازمند تأیید مشتری";
  return collection.aiEnabled ? "اجازه ثبت شده" : "غیرفعال";
};

const freshnessLabel = (collection: BusinessDataCollection) => {
  if (!collection.dataUpdatedAt) return "بدون رکورد";
  const date = new Date(collection.dataUpdatedAt);
  if (Number.isNaN(date.getTime())) return "نامشخص";
  return fa(
    new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(date)
  );
};

const CreationModal = ({
  businessCategory,
  initialTemplateId,
  open,
  onOpenChange,
  onFileSourceSelected,
}: {
  businessCategory: string;
  initialTemplateId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSourceSelected: (
    sourceType: "csv" | "excel",
    collectionKind: BusinessDataCollectionKind
  ) => void;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const initialTemplate = initialTemplateId
    ? getBusinessDataTemplate(initialTemplateId)
    : null;
  const [step, setStep] = React.useState(0);
  const [sourceType, setSourceType] = React.useState<CreationSource>("manual");
  const [templateId, setTemplateId] = React.useState(initialTemplate?.id ?? "");
  const [name, setName] = React.useState(initialTemplate?.label ?? "");
  const [description, setDescription] = React.useState(initialTemplate?.description ?? "");
  const [fields, setFields] = React.useState<BusinessDataFieldDefinition[]>(() =>
    cloneFieldDefinitions(initialTemplate?.fields ?? [])
  );
  const [accessScope, setAccessScope] =
    React.useState<BusinessDataAccessScope>(initialTemplate?.accessScope ?? "internal");
  const [aiEnabled, setAiEnabled] = React.useState(
    Boolean(initialTemplate?.aiEnabled && initialTemplate.accessScope === "public_catalog")
  );
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [fieldOpen, setFieldOpen] = React.useState(false);
  const [editingField, setEditingField] = React.useState<BusinessDataFieldDefinition | null>(null);

  const recommended = React.useMemo(
    () => getRecommendedBusinessDataTemplates(businessCategory || "other"),
    [businessCategory]
  );
  const ordered = React.useMemo(
    () => getOrderedBusinessDataTemplates(businessCategory || "other"),
    [businessCategory]
  );
  const selected = getBusinessDataTemplate(templateId);

  const selectTemplate = (template: BusinessDataTemplate) => {
    setTemplateId(template.id);
    setName(template.label);
    setDescription(template.description);
    setFields(cloneFieldDefinitions(template.fields));
    setAccessScope(template.accessScope);
    setAiEnabled(template.aiEnabled && template.accessScope === "public_catalog");
    setError("");
  };

  const canContinue =
    (step === 0 && Boolean(selected)) ||
    (step === 1 && Boolean(sourceType)) ||
    (step === 2 && Boolean(name.trim())) ||
    (step === 3 && fields.length > 0 && fields.some((field) => field.role === "title")) ||
    step >= 4;

  const continueCreation = () => {
    if (step === 1) {
      if (sourceType === "csv" || sourceType === "excel") {
        onOpenChange(false);
        onFileSourceSelected(sourceType, selected?.kind ?? "custom");
        return;
      }
    }
    if (step < CREATION_STEPS.length - 1) setStep(step + 1);
    else void create();
  };

  const saveDraftField = (nextField: BusinessDataFieldDefinition) => {
    setFields((current) => {
      const index = editingField
        ? current.findIndex((field) => field.key === editingField.key)
        : -1;
      if (index < 0) {
        return [...current, { ...nextField, position: current.length }];
      }
      return current.map((field, position) =>
        position === index ? { ...nextField, position } : field
      );
    });
  };

  const removeDraftField = (field: BusinessDataFieldDefinition) => {
    if (field.role === "title") return;
    setFields((current) =>
      current
        .filter((item) => item.key !== field.key)
        .map((item, position) => ({ ...item, position }))
    );
  };

  const moveDraftField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    setFields((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((field, position) => ({ ...field, position }));
    });
  };

  const create = async () => {
    if (!selected || !fields.length) return;
    setSaving(true);
    setError("");
    try {
      const { collection } = await businessDataRequest<{
        collection: BusinessDataCollection;
      }>(
        "/api/business-data/collections",
        jsonRequest("POST", {
          name,
          description,
          kind: selected.kind,
          accessScope,
          status: "active",
          aiEnabled: accessScope === "public_catalog" && aiEnabled,
          fields: fields.map((field, position) => ({ ...field, position })),
        })
      );
      toast({ title: "مجموعه ساخته شد", variant: "success" });
      onOpenChange(false);
      router.push(
        sourceType === "supabase"
          ? `/dashboard/data/${collection.id}/source?connect=supabase`
          : `/dashboard/data/${collection.id}`
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ساخت مجموعه انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <ModalContent
        size="lg"
        closeDisabled={saving}
        className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0"
      >
        <ModalHeader className="mb-0 shrink-0 border-b border-line px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>مجموعه جدید</ModalTitle>
          <ModalDescription>
            نوع داده را انتخاب کنید؛ ساختار پیشنهادی را بعداً هم می‌توانید تغییر دهید.
          </ModalDescription>
          <Steps
            steps={CREATION_STEPS}
            current={step}
            orientation="horizontal"
            label="مراحل ساخت مجموعه"
            onSelect={(_item, index) => setStep(index)}
            className="mt-5"
          />
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
          {error && (
            <Alert variant="error" title="ساخت مجموعه انجام نشد" description={error} className="mb-5" />
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduce ? 0 : 0.24, ease: luxe }}
            >
              {step === 0 && (
                <div>
                  <p className="text-sm font-bold">چه نوع داده‌ای می‌سازید؟</p>
                  <p className="mt-1 text-xs leading-6 text-muted">
                    نوع داده، فیلدهای پیشنهادی و تنظیمات اولیه مجموعه را مشخص می‌کند؛ همه این موارد بعداً قابل تغییر هستند.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {recommended.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => selectTemplate(template)}
                        className={cn(
                          "rounded-2xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                          templateId === template.id
                            ? "border-accent/50 bg-accent/10"
                            : "border-line bg-surface/35 hover:bg-surface/65"
                        )}
                      >
                        <span className="block text-sm font-bold">{template.label}</span>
                        <span className="mt-1 block text-xs leading-6 text-muted">
                          {template.description}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => selectTemplate(getBusinessDataTemplate("custom")!)}
                      className={cn(
                        "rounded-2xl border border-dashed p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                        templateId === "custom"
                          ? "border-accent/50 bg-accent/10"
                          : "border-line bg-surface/20 hover:bg-surface/50"
                      )}
                    >
                      <span className="block text-sm font-bold">مجموعه دلخواه</span>
                      <span className="mt-1 block text-xs leading-6 text-muted">
                        برای داده‌ای که در قالب‌های پیشنهادی نیست.
                      </span>
                    </button>
                  </div>
                  <Select
                    id="other-template"
                    label="قالب‌های دیگر"
                    searchable
                    value={templateId}
                    onChange={(value) => {
                      const template = getBusinessDataTemplate(value);
                      if (template) selectTemplate(template);
                    }}
                    options={ordered.map((template) => ({
                      value: template.id,
                      label: template.label,
                      description: template.description,
                    }))}
                    className="mt-3"
                  />
                </div>
              )}

              {step === 1 && (
                <div>
                  <p className="text-sm font-bold">داده را از کجا وارد می‌کنید؟</p>
                  <p className="mt-1 text-xs leading-6 text-muted">
                    می‌توانید ساختار را دستی بسازید یا آن را از یک فایل و جدول موجود شروع کنید.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {CREATION_SOURCES.map((source) => {
                      const SourceIcon = source.icon;
                      const active = sourceType === source.value;
                      return (
                        <button
                          key={source.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSourceType(source.value)}
                          className={cn(
                            "rounded-2xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                            active ? "border-accent/50 bg-accent/10" : "border-line bg-surface/35 hover:bg-surface/65"
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm font-bold">
                            <SourceIcon className="size-4 text-accent" aria-hidden />
                            {source.label}
                          </span>
                          <span className="mt-1 block text-xs leading-6 text-muted">{source.description}</span>
                        </button>
                      );
                    })}
                  </div>
                  {sourceType === "supabase" && (
                    <Alert
                      variant="default"
                      title="یک ساختار اولیه انتخاب کنید"
                      description="بعد از ساخت مجموعه، فرم اتصال Supabase برای انتخاب جدول و تطبیق ستون‌ها باز می‌شود."
                      className="mt-4"
                    />
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <Input
                    id="collection-name"
                    label="نام مجموعه"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    required
                  />
                  <Textarea
                    id="collection-description"
                    label="توضیح کوتاه"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={1000}
                    showCount
                    rows={3}
                  />
                </div>
              )}

              {step === 3 && selected && (
                <div>
                  <p className="text-sm font-bold">فیلدهای شروع</p>
                  <p className="mt-1 text-xs leading-6 text-muted">
                    فیلدها را قبل از ساخت مجموعه کامل کنید. نام، نوع، دسترسی و ترتیب هر فیلد قابل تغییر است.
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted">
                      {fa(fields.length)} فیلد · یک فیلد عنوان برای هر رکورد لازم است
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      startIcon={<Plus className="size-4" />}
                      onClick={() => {
                        setEditingField(null);
                        setFieldOpen(true);
                      }}
                    >
                      فیلد جدید
                    </Button>
                  </div>
                  <ol className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface/30 px-4">
                    {fields.map((field, index) => (
                      <li key={field.key} className="flex items-start gap-3 py-3 text-sm">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-line text-xs font-bold text-muted">
                          {fa(index + 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-bold">{field.label}</span>
                            <Badge variant="muted">{FIELD_TYPE_LABELS[field.type]}</Badge>
                            {field.required && <Badge variant="warning">الزامی</Badge>}
                            <Badge variant={field.aiExposure === "hidden" ? "muted" : "accent"}>
                              {AI_EXPOSURE_LABELS[field.aiExposure]}
                            </Badge>
                          </div>
                          {field.description && (
                            <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted">
                              {field.description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="انتقال فیلد به بالا"
                            disabled={index === 0}
                            onClick={() => moveDraftField(index, -1)}
                          >
                            <ArrowUp className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="انتقال فیلد به پایین"
                            disabled={index === fields.length - 1}
                            onClick={() => moveDraftField(index, 1)}
                          >
                            <ArrowDown className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="ویرایش فیلد"
                            onClick={() => {
                              setEditingField(field);
                              setFieldOpen(true);
                            }}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="حذف فیلد"
                            className="hover:text-danger"
                            disabled={field.role === "title"}
                            onClick={() => removeDraftField(field)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <Select
                    id="collection-access"
                    label="چه کسی می‌تواند از این داده استفاده کند؟"
                    options={ACCESS_OPTIONS}
                    value={accessScope}
                    onChange={(value) => {
                      const scope = value as BusinessDataAccessScope;
                      setAccessScope(scope);
                      if (scope !== "public_catalog") setAiEnabled(false);
                    }}
                  />
                  {accessScope === "public_catalog" ? (
                    <div className="rounded-2xl border border-line bg-surface/35 p-4">
                      <Switch
                        checked={aiEnabled}
                        onChange={(event) => setAiEnabled(event.target.checked)}
                        label="اجازه استفاده دستیار از این مجموعه"
                      />
                      <p className="mt-2 text-xs leading-6 text-muted">
                        این اجازه اکنون ذخیره می‌شود؛ اتصال واقعی داده به پاسخ‌های دستیار در مرحله بعد انجام می‌شود.
                      </p>
                    </div>
                  ) : (
                    <Alert
                      variant={accessScope === "internal" ? "default" : "warning"}
                      title={
                        accessScope === "internal"
                          ? "این مجموعه همیشه از دستیار پنهان است"
                          : "تأیید هویت مشتری هنوز آماده نیست"
                      }
                      description={
                        accessScope === "internal"
                          ? "داده داخلی فقط در داشبورد مدیریت می‌شود."
                          : "تا زمان پیاده‌سازی تأیید مشتری، دستیار به سفارش‌ها و داده‌های خصوصی دسترسی ندارد."
                      }
                    />
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <ModalFooter className="mt-0 shrink-0 flex-col-reverse border-t border-line px-5 py-4 sm:flex-row sm:px-7 sm:py-5">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => (step > 0 ? setStep(step - 1) : onOpenChange(false))}
            className="w-full sm:w-auto"
          >
            {step > 0 ? "مرحله قبل" : "انصراف"}
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={!canContinue}
            onClick={continueCreation}
            className="w-full sm:w-auto"
          >
            {step < CREATION_STEPS.length - 1 ? "ادامه" : sourceType === "supabase" ? "ساخت و اتصال Supabase" : "ساخت مجموعه"}
          </Button>
        </ModalFooter>
      </ModalContent>
      {fieldOpen && (
        <FieldEditorModal
          field={editingField}
          open
          onOpenChange={setFieldOpen}
          onDraftSaved={saveDraftField}
        />
      )}
    </Modal>
  );
};

const CollectionRow = ({ collection }: { collection: BusinessDataCollection }) => {
  const reduce = useReducedMotion();
  const archived = collection.status === "archived";
  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
      className="group rounded-2xl border border-line bg-surface/30 transition-colors hover:bg-surface/55"
    >
      <Link
        href={`/dashboard/data/${collection.id}`}
        className="block rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:p-5"
      >
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-line text-muted">
            <Database className="size-4.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-bold">{collection.name}</h2>
              <Badge variant={archived ? "muted" : "success"} dot>
                {COLLECTION_STATUS_LABELS[collection.status]}
              </Badge>
            </div>
            {collection.description && (
              <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted">
                {collection.description}
              </p>
            )}
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-5">
              <div>
                <dt className="text-muted">رکورد</dt>
                <dd className="mt-1 font-medium">{fa(collection.recordCount)}</dd>
              </div>
              <div>
                <dt className="text-muted">منبع</dt>
                <dd className="mt-1 font-medium">{sourceLabel(collection)}</dd>
              </div>
              <div>
                <dt className="text-muted">دسترسی</dt>
                <dd className="mt-1 font-medium">
                  {ACCESS_SCOPE_LABELS[collection.accessScope]}
                </dd>
              </div>
              <div>
                <dt className="text-muted">دستیار</dt>
                <dd className="mt-1 font-medium">{assistantLabel(collection)}</dd>
              </div>
              <div>
                <dt className="text-muted">تازگی داده</dt>
                <dd className="mt-1 font-medium">{freshnessLabel(collection)}</dd>
              </div>
            </dl>
          </div>
          <ArrowLeft className="mt-2 size-4 shrink-0 text-muted transition-transform group-hover:-translate-x-1" aria-hidden />
        </div>
      </Link>
    </motion.li>
  );
};

export const BusinessDataIndexPanel = () => {
  const router = useRouter();
  const [collections, setCollections] = React.useState<BusinessDataCollection[]>([]);
  const [businessCategory, setBusinessCategory] = React.useState("other");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [creatorOpen, setCreatorOpen] = React.useState(false);
  const [creatorTemplateId, setCreatorTemplateId] = React.useState<string>();
  const [fileImportOpen, setFileImportOpen] = React.useState(false);
  const [fileImportSourceType, setFileImportSourceType] = React.useState<"csv" | "excel">("csv");
  const [fileImportCollectionKind, setFileImportCollectionKind] =
    React.useState<BusinessDataCollectionKind>("custom");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await businessDataRequest<{
        collections: BusinessDataCollection[];
        businessCategory: string;
      }>("/api/business-data/collections");
      setCollections(data.collections);
      setBusinessCategory(data.businessCategory);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "بارگذاری مجموعه‌ها انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openCreator = (templateId?: string) => {
    setCreatorTemplateId(templateId);
    setCreatorOpen(true);
  };

  const recommendations = getRecommendedBusinessDataTemplates(businessCategory, 5);

  return (
    <>
      <DashboardPageHeader
        title="داده‌های کسب‌وکار"
        description="محصولات، خدمات و داده‌های عملیاتی را با ساختاری روشن و امن مدیریت کنید."
        icon={Database}
        count={collections.length}
        loading={loading}
        action={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Button type="button" variant="ghost" startIcon={<FileSpreadsheet className="size-4" />} onClick={() => { setFileImportCollectionKind("custom"); setFileImportOpen(true); }}>ورود از فایل</Button><Button type="button" startIcon={<Plus className="size-4" />} onClick={() => openCreator()}>مجموعه جدید</Button></div>}
      />

      {error && (
        <Alert variant="error" title="مجموعه‌ها بارگذاری نشد" description={error} className="mb-5">
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} className="mt-3">
            تلاش دوباره
          </Button>
        </Alert>
      )}

      {!loading && !error && (
        <section aria-labelledby="recommended-data-heading" className="mb-8 border-b border-line pb-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="recommended-data-heading" className="text-sm font-bold">
                پیشنهاد برای شروع
              </h2>
              <p className="mt-1 text-xs leading-6 text-muted">
                بر اساس نوع کسب‌وکار شما؛ هر قالب قابل تغییر است.
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {recommendations.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => openCreator(template.id)}
                className="min-w-40 rounded-2xl border border-line bg-surface/30 p-4 text-start transition-colors hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span className="block text-sm font-bold">{template.label}</span>
                <span className="mt-1 block line-clamp-2 text-xs leading-6 text-muted">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div role="status" aria-label="در حال بارگذاری مجموعه‌ها" className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl border border-line bg-surface/30 p-5">
              <div className="flex items-start gap-4">
                <Skeleton className="size-10 rounded-2xl" />
                <SkeletonText className="flex-1" lines={3} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && collections.length === 0 && (
        <EmptyState
          icon={Database}
          title="اولین مجموعه را بسازید"
          description="یک قالب انتخاب کنید و رکوردها را به‌صورت دستی وارد کنید. فایل و اتصال خودکار در مرحله‌های بعد اضافه می‌شود."
          action={
            <Button type="button" startIcon={<Plus className="size-4" />} onClick={() => openCreator()}>
              ساخت مجموعه
            </Button>
          }
        />
      )}

      {!loading && !error && collections.length > 0 && (
        <section aria-labelledby="collections-heading">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="collections-heading" className="text-sm font-bold">مجموعه‌های شما</h2>
            <Badge variant="muted">{fa(collections.length)}</Badge>
          </div>
          <ul className="space-y-2">{collections.map((collection) => <CollectionRow key={collection.id} collection={collection} />)}</ul>
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Waypoints className="size-3.5" aria-hidden /> منبع فعلی: مدیریت دستی</span>
            <span className="flex items-center gap-1.5"><Eye className="size-3.5" aria-hidden /> اتصال به پاسخ‌های دستیار هنوز فعال نشده است</span>
            <span className="flex items-center gap-1.5"><CircleAlert className="size-3.5" aria-hidden /> داده خصوصی نیازمند تأیید مشتری است</span>
          </div>
        </section>
      )}

      {creatorOpen && (
        <CreationModal
          businessCategory={businessCategory}
          initialTemplateId={creatorTemplateId}
          open
          onOpenChange={setCreatorOpen}
          onFileSourceSelected={(sourceType, collectionKind) => {
            setFileImportSourceType(sourceType);
            setFileImportCollectionKind(collectionKind);
            setFileImportOpen(true);
          }}
        />
      )}
      <FileImportFlow sourceType={fileImportSourceType} collectionKind={fileImportCollectionKind} open={fileImportOpen} onOpenChange={setFileImportOpen} onImported={(collectionId) => { if (collectionId) router.push(`/dashboard/data/${collectionId}`); else void load(); }} />
    </>
  );
};
