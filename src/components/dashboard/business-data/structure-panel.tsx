"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { useDashboardTitle } from "@/components/dashboard/title-context";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import {
  ACCESS_SCOPE_LABELS,
  AI_EXPOSURE_LABELS,
  FIELD_TYPE_LABELS,
  type BusinessDataCollectionDetail,
  type BusinessDataField,
  type BusinessDataRecordPage,
} from "@/lib/business-data/api-types";
import { businessDataRequest, jsonRequest } from "@/lib/business-data/client";
import type {
  BusinessDataAccessScope,
  BusinessDataAiExposure,
  BusinessDataFieldType,
} from "@/lib/business-data/types";
import { selectAiAnswerValues } from "@/lib/business-data/validation";
import { fa } from "@/lib/utils";
import { useBusinessDataCollection } from "./use-collection";

const ACCESS_OPTIONS = [
  {
    value: "public_catalog",
    label: "عمومی",
    description: "اطلاعاتی مثل محصول، خدمت یا منو",
  },
  {
    value: "verified_customer",
    label: "فقط مشتری تأییدشده",
    description: "سفارش، رزرو و اطلاعات مخصوص یک مشتری",
  },
  {
    value: "internal",
    label: "داخلی",
    description: "فقط برای مدیریت داخل کسب‌وکار",
  },
];

const FIELD_TYPE_OPTIONS = Object.entries(FIELD_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

const AI_EXPOSURE_OPTIONS = Object.entries(AI_EXPOSURE_LABELS).map(
  ([value, label]) => ({ value, label })
);

type FieldDraft = {
  label: string;
  description: string;
  type: BusinessDataFieldType;
  required: boolean;
  searchable: boolean;
  filterable: boolean;
  aiExposure: BusinessDataAiExposure;
  optionsText: string;
};

const fieldDraft = (field: BusinessDataField | null): FieldDraft => ({
  label: field?.label ?? "",
  description: field?.description ?? "",
  type: field?.type ?? "text",
  required: field?.required ?? false,
  searchable: field?.searchable ?? true,
  filterable: field?.filterable ?? false,
  aiExposure: field?.aiExposure ?? "hidden",
  optionsText: field?.validation?.options?.join("\n") ?? "",
});

const FieldEditorModal = ({
  collection,
  field,
  open,
  onOpenChange,
  onSaved,
}: {
  collection: BusinessDataCollectionDetail;
  field: BusinessDataField | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (collection: BusinessDataCollectionDetail) => void;
}) => {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<FieldDraft>(() => fieldDraft(field));
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const hasRecords = collection.recordCount > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = draft.label.trim();
    if (!label) {
      setError("نام فیلد را وارد کنید.");
      return;
    }
    const options = draft.optionsText
      .split(/\n|،|,/)
      .map((option) => option.trim())
      .filter(Boolean);
    if (draft.type === "select" && !options.length) {
      setError("برای فیلد انتخابی دست‌کم یک گزینه وارد کنید.");
      return;
    }
    setSaving(true);
    setError("");
    const key = field?.key ?? `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const payload = {
      key,
      label,
      description: draft.description,
      type: draft.type,
      role: field?.role ?? "custom",
      required: draft.required,
      searchable: draft.searchable,
      filterable: draft.filterable,
      aiExposure: draft.aiExposure,
      ...(draft.type === "select"
        ? { validation: { options } }
        : field?.type === draft.type && field?.validation
          ? { validation: field.validation }
          : {}),
    };
    try {
      const base = `/api/business-data/collections/${collection.id}/fields`;
      const data = await businessDataRequest<{
        collection: BusinessDataCollectionDetail;
      }>(
        field ? `${base}/${field.id}` : base,
        jsonRequest(field ? "PATCH" : "POST", payload)
      );
      toast({
        title: field ? "فیلد به‌روز شد" : "فیلد افزوده شد",
        variant: "success",
      });
      onOpenChange(false);
      onSaved(data.collection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ذخیره فیلد انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <ModalContent
        size="md"
        closeDisabled={saving}
        className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0"
      >
        <ModalHeader className="mb-0 shrink-0 border-b border-line px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>{field ? "ویرایش فیلد" : "فیلد جدید"}</ModalTitle>
          <ModalDescription>
            نامی بنویسید که هنگام ورود رکوردها برای اعضای کسب‌وکار روشن باشد.
          </ModalDescription>
        </ModalHeader>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
            {error && <Alert variant="error" title="فیلد ذخیره نشد" description={error} />}
            {hasRecords && field && (
              <Alert
                variant="warning"
                title="ساختار رکوردهای موجود حفظ می‌شود"
                description="تا وقتی مجموعه رکورد دارد، نوع و الزامی‌بودن این فیلد قابل تغییر نیست؛ نام و دسترسی آن همچنان قابل ویرایش است."
              />
            )}
            <Input
              id="field-label"
              label="نام فیلد"
              value={draft.label}
              onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              maxLength={120}
              required
              disabled={saving}
            />
            <Textarea
              id="field-description"
              label="راهنمای کوتاه"
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              maxLength={500}
              rows={2}
              disabled={saving}
            />
            <Select
              id="field-type"
              label="نوع مقدار"
              options={FIELD_TYPE_OPTIONS}
              value={draft.type}
              onChange={(value) => setDraft((current) => ({ ...current, type: value as BusinessDataFieldType }))}
              disabled={saving || (hasRecords && Boolean(field))}
            />
            {draft.type === "select" && (
              <Textarea
                id="field-options"
                label="گزینه‌ها"
                hint="هر گزینه را در یک خط بنویسید."
                value={draft.optionsText}
                onChange={(event) => setDraft((current) => ({ ...current, optionsText: event.target.value }))}
                rows={4}
                disabled={saving || (hasRecords && Boolean(field))}
              />
            )}
            <div className="space-y-4 rounded-2xl border border-line bg-surface/25 p-4">
              <Checkbox
                label="این فیلد الزامی است"
                checked={draft.required}
                onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))}
                disabled={saving || (hasRecords && Boolean(field))}
              />
              <Checkbox
                label="در جستجو استفاده شود"
                checked={draft.searchable}
                onChange={(event) => setDraft((current) => ({ ...current, searchable: event.target.checked }))}
                disabled={saving}
              />
              <Checkbox
                label="در فیلترها قابل استفاده باشد"
                checked={draft.filterable}
                onChange={(event) => setDraft((current) => ({ ...current, filterable: event.target.checked }))}
                disabled={saving}
              />
            </div>
            <Select
              id="field-ai-exposure"
              label="دستیار با این فیلد چه می‌کند؟"
              options={AI_EXPOSURE_OPTIONS}
              value={draft.aiExposure}
              onChange={(value) => setDraft((current) => ({ ...current, aiExposure: value as BusinessDataAiExposure }))}
              disabled={saving}
            />
          </div>
          <ModalFooter className="mt-0 shrink-0 flex-col-reverse border-t border-line px-5 py-4 sm:flex-row sm:px-7 sm:py-5">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)} className="w-full sm:w-auto">انصراف</Button>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">{field ? "ذخیره تغییرات" : "افزودن فیلد"}</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const AssistantVisibilityModal = ({
  collection,
  open,
  onOpenChange,
}: {
  collection: BusinessDataCollectionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [sample, setSample] = React.useState<Record<string, string | number | boolean | null> | null>(null);
  const [loading, setLoading] = React.useState(
    open &&
      collection.accessScope === "public_catalog" &&
      collection.fields.some((field) => field.aiExposure === "answer")
  );
  const answerFields = collection.fields.filter((field) => field.aiExposure === "answer");
  const hiddenCount = collection.fields.filter((field) => field.aiExposure === "hidden").length;
  const eligible =
    collection.accessScope === "public_catalog" ||
    (collection.accessScope === "verified_customer" &&
      collection.aiEnabled &&
      collection.privateAccess?.enabled);

  React.useEffect(() => {
    if (!open || !eligible || !answerFields.length) return;
    let active = true;
    businessDataRequest<{ page: BusinessDataRecordPage }>(
      `/api/business-data/collections/${collection.id}/records?page=1&pageSize=1&status=active`
    )
      .then(({ page }) => {
        if (!active) return;
        const record = page.records[0];
        setSample(
          record ? selectAiAnswerValues(record.values, collection.fields) : null
        );
      })
      .catch(() => active && setSample(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [answerFields.length, collection.fields, collection.id, eligible, open]);

  const reason =
    collection.accessScope === "internal"
      ? "این مجموعه داخلی است و هیچ بخشی از آن به دستیار داده نمی‌شود."
      : collection.accessScope === "verified_customer"
        ? collection.aiEnabled && collection.privateAccess?.enabled
          ? "دستیار فقط پس از تأیید موفق مشتری، پاسخ‌های محدود این مجموعه را دریافت می‌کند. فیلدهای تأیید و پنهان هرگز نمایش داده نمی‌شوند."
          : "برای این مجموعه هنوز دو فیلد تأیید امن انتخاب نشده است؛ دستیار به داده دسترسی ندارد."
        : !collection.aiEnabled
          ? "اجازه استفاده دستیار برای این مجموعه خاموش است."
          : "اجازه دسترسی ثبت شده است، اما اتصال واقعی داده به پاسخ‌های دستیار در مرحله بعد پیاده‌سازی می‌شود.";

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>آنچه دستیار می‌بیند</ModalTitle>
          <ModalDescription>
            نمای امنی از تنظیمات این مجموعه؛ هیچ شناسه داخلی یا مقدار پنهانی در این پنجره نمایش داده نمی‌شود.
          </ModalDescription>
        </ModalHeader>
        <Alert
          variant={eligible ? "info" : "warning"}
          title={eligible ? "دسترسی عمومی" : "دسترسی دستیار بسته است"}
          description={reason}
        />
        <dl className="mt-5 grid gap-4 rounded-2xl border border-line bg-surface/25 p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">نوع دسترسی</dt><dd className="mt-1 font-medium">{ACCESS_SCOPE_LABELS[collection.accessScope]}</dd></div>
          <div><dt className="text-xs text-muted">منبع</dt><dd className="mt-1 font-medium">{collection.source?.type === "manual" ? "مدیریت دستی" : collection.source?.name ?? "نامشخص"}</dd></div>
          <div><dt className="text-xs text-muted">آخرین تغییر داده</dt><dd className="mt-1 font-medium">{collection.dataUpdatedAt ? fa(new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(collection.dataUpdatedAt))) : "هنوز رکوردی ثبت نشده"}</dd></div>
        </dl>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <section aria-labelledby="visible-fields-title">
            <h3 id="visible-fields-title" className="flex items-center gap-2 text-sm font-bold"><Eye className="size-4 text-accent" aria-hidden /> فیلدهای قابل نمایش</h3>
            {answerFields.length ? (
              <ul className="mt-3 space-y-2">{answerFields.map((field) => <li key={field.id} className="rounded-2xl border border-line bg-surface/25 px-3 py-2 text-sm">{field.label}</li>)}</ul>
            ) : (
              <p className="mt-3 text-xs leading-6 text-muted">هیچ فیلدی برای نمایش در پاسخ انتخاب نشده است.</p>
            )}
          </section>
          <section aria-labelledby="hidden-fields-title">
            <h3 id="hidden-fields-title" className="flex items-center gap-2 text-sm font-bold"><EyeOff className="size-4 text-muted" aria-hidden /> فیلدهای کاملاً پنهان</h3>
            <p className="mt-3 rounded-2xl border border-line bg-surface/25 p-4 text-sm">{fa(hiddenCount)} فیلد پنهان است. مقدار این فیلدها اینجا و در پاسخ دستیار نمایش داده نمی‌شود.</p>
          </section>
        </div>
        {eligible && (
          <section aria-labelledby="safe-sample-title" className="mt-6 border-t border-line pt-5">
            <h3 id="safe-sample-title" className="text-sm font-bold">نمونه پاک‌سازی‌شده</h3>
            {loading ? (
              <SkeletonText className="mt-3" lines={3} />
            ) : sample && Object.keys(sample).length ? (
              <dl className="mt-3 grid gap-2 rounded-2xl border border-line bg-surface/25 p-4 text-sm sm:grid-cols-2">
                {Object.entries(sample).map(([key, value]) => {
                  const field = collection.fields.find((item) => item.key === key);
                  return <div key={key} className="min-w-0"><dt className="text-xs text-muted">{field?.label ?? "فیلد"}</dt><dd className="mt-1 truncate">{fa(String(value ?? "—"))}</dd></div>;
                })}
              </dl>
            ) : (
              <p className="mt-2 text-xs leading-6 text-muted">رکورد فعالی برای ساخت نمونه امن وجود ندارد.</p>
            )}
          </section>
        )}
        <ModalFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>بستن</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const PrivateAccessPanel = ({
  collection,
  onSaved,
}: {
  collection: BusinessDataCollectionDetail;
  onSaved: (collection: BusinessDataCollectionDetail) => void;
}) => {
  const { toast } = useToast();
  const eligibleFields = collection.fields.filter(
    (field) =>
      field.required && field.filterable && field.aiExposure === "filter_only"
  );
  const [locatorFieldId, setLocatorFieldId] = React.useState(
    collection.privateAccess?.locatorFieldId ?? ""
  );
  const [verificationFieldId, setVerificationFieldId] = React.useState(
    collection.privateAccess?.verificationFieldId ?? ""
  );
  const [enabled, setEnabled] = React.useState(
    collection.privateAccess?.enabled ?? false
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setLocatorFieldId(collection.privateAccess?.locatorFieldId ?? "");
    setVerificationFieldId(collection.privateAccess?.verificationFieldId ?? "");
    setEnabled(collection.privateAccess?.enabled ?? false);
  }, [collection.privateAccess]);

  const suggestedLocator = eligibleFields.find((field) => field.role === "reference");
  const suggestedVerifier = eligibleFields.find(
    (field) =>
      field.role === "phone" ||
      field.role === "email" ||
      field.role === "customer_identifier" ||
      field.role === "account_identifier" ||
      field.role === "channel_identifier"
  );
  const options = eligibleFields.map((field) => ({
    value: field.id,
    label: field.label,
    description:
      field.id === suggestedLocator?.id || field.id === suggestedVerifier?.id
        ? "پیشنهادی براساس نوع فیلد"
        : undefined,
  }));

  const save = async () => {
    if (!locatorFieldId || !verificationFieldId || locatorFieldId === verificationFieldId) {
      toast({
        title: "دو فیلد متفاوت انتخاب کنید",
        description: "یک شناسه رکورد و یک اطلاعات مشتری لازم است.",
        variant: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const data = await businessDataRequest<{
        collection: BusinessDataCollectionDetail;
      }>(
        `/api/business-data/collections/${collection.id}/private-access`,
        jsonRequest("PUT", {
          enabled,
          locatorFieldId,
          verificationFieldId,
        })
      );
      onSaved(data.collection);
      toast({
        title: enabled ? "تأیید مشتری فعال شد" : "تأیید مشتری غیرفعال شد",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "تنظیم تأیید مشتری انجام نشد",
        description: caught instanceof Error ? caught.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!eligibleFields.length) {
    return (
      <Alert
        variant="warning"
        title="فیلد تأیید آماده نیست"
        description="دو فیلد متفاوت بسازید یا ویرایش کنید: هر دو باید الزامی، قابل فیلتر و «فقط برای پیدا کردن رکورد» باشند. برای سفارش معمولاً شناسه سفارش و شماره موبایل مناسب است."
      />
    );
  }

  return (
    <section aria-labelledby="private-access-heading" className="mt-8 rounded-3xl border border-line bg-surface/20 p-5 sm:p-6">
      <div className="border-b border-line pb-5">
        <h2 id="private-access-heading" className="text-base font-bold">تأیید مشتری</h2>
        <p className="mt-1 text-xs leading-6 text-muted">دستیار فقط وقتی پاسخ این مجموعه را می‌بیند که این دو مورد با یک رکورد مطابقت داشته باشد. هیچ‌یک از این مقادیر در پاسخ نمایش داده نمی‌شود.</p>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Select id="private-locator-field" label="شناسه رکورد" hint="مثلاً شماره سفارش یا کد رزرو" options={options} value={locatorFieldId} onChange={setLocatorFieldId} disabled={saving} />
        <Select id="private-verification-field" label="اطلاعات تأیید مشتری" hint="مثلاً شماره موبایل، ایمیل یا شناسه حساب" options={options} value={verificationFieldId} onChange={setVerificationFieldId} disabled={saving} />
      </div>
      <div className="mt-5 rounded-2xl border border-line bg-surface/35 p-4">
        <Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={saving} label="اجازه پاسخ‌گویی پس از تأیید مشتری" />
        <p className="mt-2 text-xs leading-6 text-muted">تأیید فقط برای همین گفت‌وگو و حداکثر ده دقیقه معتبر است. دستیار هرگز داده داخلی یا فیلدهای تأیید را دریافت نمی‌کند.</p>
      </div>
      <div className="mt-5 flex justify-end"><Button type="button" loading={saving} onClick={() => void save()}>ذخیره تنظیم تأیید</Button></div>
    </section>
  );
};

const DeleteCollectionModal = ({
  collection,
  open,
  onOpenChange,
}: {
  collection: BusinessDataCollectionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmation, setConfirmation] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await businessDataRequest(
        `/api/business-data/collections/${collection.id}`,
        jsonRequest("DELETE", { confirmation })
      );
      toast({ title: "مجموعه حذف شد", variant: "success" });
      onOpenChange(false);
      router.replace("/dashboard/data");
      router.refresh();
    } catch (caught) {
      toast({
        title: "حذف مجموعه انجام نشد",
        description: caught instanceof Error ? caught.message : undefined,
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <ModalContent size="sm" closeDisabled={deleting}>
        <ModalHeader>
          <ModalTitle>حذف همیشگی مجموعه؟</ModalTitle>
          <ModalDescription>
            تمام فیلدها و {fa(collection.recordCount)} رکورد حذف می‌شود. برای تأیید، نام مجموعه را دقیق بنویسید.
          </ModalDescription>
        </ModalHeader>
        <Input
          id="delete-collection-confirmation"
          label={`نام مجموعه: ${collection.name}`}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={deleting}
        />
        <ModalFooter>
          <Button type="button" variant="ghost" disabled={deleting} onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button type="button" variant="danger" loading={deleting} disabled={confirmation.trim() !== collection.name} onClick={() => void remove()}>حذف همیشگی</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export const BusinessDataStructurePanel = ({ collectionId }: { collectionId: string }) => {
  const router = useRouter();
  const { toast } = useToast();
  const { collection, setCollection, loading, error, reload } = useBusinessDataCollection(collectionId);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [accessScope, setAccessScope] = React.useState<BusinessDataAccessScope>("internal");
  const [aiEnabled, setAiEnabled] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [fieldOpen, setFieldOpen] = React.useState(false);
  const [editingField, setEditingField] = React.useState<BusinessDataField | null>(null);
  const [deletingFieldId, setDeletingFieldId] = React.useState<string | null>(null);
  const [movingFieldId, setMovingFieldId] = React.useState<string | null>(null);
  const [visibilityOpen, setVisibilityOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  useDashboardTitle(collection?.name ?? null);

  React.useEffect(() => {
    if (!collection) return;
    const timer = window.setTimeout(() => {
      setName(collection.name);
      setDescription(collection.description);
      setAccessScope(collection.accessScope);
      setAiEnabled(collection.aiEnabled);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collection]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!collection) return;
    setSavingSettings(true);
    try {
      const data = await businessDataRequest<{ collection: BusinessDataCollectionDetail }>(
        `/api/business-data/collections/${collection.id}`,
        jsonRequest("PATCH", {
          name,
          description,
          accessScope,
          aiEnabled: accessScope === "public_catalog" && aiEnabled,
        })
      );
      setCollection(data.collection);
      toast({ title: "تنظیمات ذخیره شد", variant: "success" });
    } catch (caught) {
      toast({
        title: "ذخیره تنظیمات انجام نشد",
        description: caught instanceof Error ? caught.message : undefined,
        variant: "error",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const archiveCollection = async () => {
    if (!collection) return;
    setSavingSettings(true);
    try {
      const data = await businessDataRequest<{ collection: BusinessDataCollectionDetail }>(
        `/api/business-data/collections/${collection.id}`,
        jsonRequest("PATCH", {
          status: collection.status === "archived" ? "active" : "archived",
        })
      );
      setCollection(data.collection);
      toast({ title: data.collection.status === "archived" ? "مجموعه بایگانی شد" : "مجموعه فعال شد", variant: "success" });
    } catch (caught) {
      toast({ title: "تغییر وضعیت انجام نشد", description: caught instanceof Error ? caught.message : undefined, variant: "error" });
    } finally {
      setSavingSettings(false);
    }
  };

  const mutateField = async (field: BusinessDataField, action: "delete" | "up" | "down") => {
    if (!collection) return;
    if (action === "delete") setDeletingFieldId(field.id);
    else setMovingFieldId(field.id);
    try {
      const url = `/api/business-data/collections/${collection.id}/fields/${field.id}`;
      const data = await businessDataRequest<{ collection: BusinessDataCollectionDetail }>(
        url,
        action === "delete" ? jsonRequest("DELETE") : jsonRequest("PATCH", { move: action === "up" ? -1 : 1 })
      );
      setCollection(data.collection);
      toast({ title: action === "delete" ? "فیلد حذف شد" : "ترتیب فیلدها تغییر کرد", variant: "success" });
    } catch (caught) {
      toast({
        title: action === "delete" ? "حذف فیلد انجام نشد" : "جابه‌جایی انجام نشد",
        description: caught instanceof Error ? caught.message : undefined,
        variant: "error",
      });
    } finally {
      setDeletingFieldId(null);
      setMovingFieldId(null);
    }
  };

  if (loading) {
    return (
      <div role="status" aria-label="در حال بارگذاری ساختار مجموعه">
        <div className="flex items-start gap-4"><Skeleton className="size-11 rounded-2xl" /><SkeletonText className="flex-1" lines={2} /></div>
        <div className="mt-8 space-y-4"><div className="rounded-3xl border border-line bg-surface/30 p-6"><SkeletonText lines={6} /></div><div className="rounded-3xl border border-line bg-surface/30 p-6"><SkeletonText lines={8} /></div></div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <Alert variant="error" title="ساختار مجموعه بارگذاری نشد" description={error}>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" startIcon={<RefreshCw className="size-4" />} onClick={() => void reload()}>تلاش دوباره</Button>
          <Button type="button" size="sm" variant="ghost" startIcon={<ArrowRight className="size-4" />} onClick={() => router.push("/dashboard/data")}>بازگشت</Button>
        </div>
      </Alert>
    );
  }

  return (
    <>
      <DashboardPageHeader
        title="ساختار و دسترسی"
        description="فیلدهای مجموعه و مرز استفاده دستیار را بدون نمایش جزئیات فنی مدیریت کنید."
        icon={Settings2}
        action={
          <Button type="button" variant="outline" startIcon={<Eye className="size-4" />} onClick={() => setVisibilityOpen(true)} className="w-full sm:w-auto">
            آنچه دستیار می‌بیند
          </Button>
        }
      />

      <form onSubmit={saveSettings} className="rounded-3xl border border-line bg-surface/30 p-5 sm:p-6">
        <div className="flex flex-col gap-1 border-b border-line pb-5">
          <h2 className="text-base font-bold">تنظیمات مجموعه</h2>
          <p className="text-xs leading-6 text-muted">نام، توضیح و نوع دسترسی را برای اعضای کسب‌وکار روشن نگه دارید.</p>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Input id="structure-name" label="نام مجموعه" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} disabled={savingSettings} />
          <Select
            id="structure-access"
            label="نوع دسترسی"
            options={ACCESS_OPTIONS}
            value={accessScope}
          onChange={(value) => {
              const scope = value as BusinessDataAccessScope;
              setAccessScope(scope);
              if (scope !== "public_catalog") setAiEnabled(false);
            }}
            disabled={savingSettings}
          />
          <Textarea id="structure-description" label="توضیح" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} className="sm:col-span-2" disabled={savingSettings} />
        </div>
        <div className="mt-5 rounded-2xl border border-line bg-surface/35 p-4">
          <Switch
            checked={aiEnabled}
            onChange={(event) => setAiEnabled(event.target.checked)}
            disabled={savingSettings || accessScope !== "public_catalog"}
            label="اجازه استفاده دستیار از این مجموعه"
          />
          <p className="mt-2 text-xs leading-6 text-muted">
            {accessScope === "public_catalog"
              ? "این اجازه برای اتصال ساخت‌یافته آینده ذخیره می‌شود؛ در این مرحله داده هنوز وارد پاسخ دستیار نمی‌شود."
              : accessScope === "verified_customer"
                ? "تنظیم تأیید مشتری را پایین‌تر کامل کنید؛ تا آن زمان دستیار به این مجموعه دسترسی ندارد."
                : "مجموعه داخلی همیشه از دستیار پنهان می‌ماند."}
          </p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="submit" loading={savingSettings}>ذخیره تنظیمات</Button>
        </div>
      </form>

      {collection.accessScope === "verified_customer" && (
        <PrivateAccessPanel collection={collection} onSaved={setCollection} />
      )}

      <section aria-labelledby="fields-heading" className="mt-8 rounded-3xl border border-line bg-surface/20 p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="fields-heading" className="text-base font-bold">فیلدهای مجموعه</h2>
              <Badge variant="muted">{fa(collection.fields.length)}</Badge>
            </div>
            <p className="mt-1 text-xs leading-6 text-muted">فیلد عنوان پایه هر رکورد است. کلیدهای داخلی ثابت می‌مانند و به کاربر نمایش داده نمی‌شوند.</p>
          </div>
          <Button type="button" size="sm" startIcon={<Plus className="size-4" />} disabled={collection.status === "archived"} onClick={() => { setEditingField(null); setFieldOpen(true); }}>فیلد جدید</Button>
        </div>
        {collection.recordCount > 0 && (
          <Alert variant="warning" title="حفاظت از رکوردهای موجود فعال است" description="حذف فیلد و تغییر نوع یا الزامی‌بودن آن تا زمانی که مجموعه رکورد دارد مسدود است." className="mt-5" />
        )}
        {collection.status === "archived" && (
          <Alert variant="default" title="ساختار مجموعه بایگانی‌شده فقط خواندنی است" description="برای تغییر فیلدها، ابتدا مجموعه را دوباره فعال کنید." className="mt-5" />
        )}
        <ol className="mt-5 divide-y divide-line">
          {collection.fields.map((field, index) => (
            <li key={field.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-line text-xs font-bold text-muted">{fa(index + 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold">{field.label}</h3>
                  <Badge variant="muted">{FIELD_TYPE_LABELS[field.type]}</Badge>
                  {field.required && <Badge variant="warning">الزامی</Badge>}
                  <Badge variant={field.aiExposure === "hidden" ? "muted" : "accent"}>{AI_EXPOSURE_LABELS[field.aiExposure]}</Badge>
                </div>
                {field.description && <p className="mt-1 text-xs leading-6 text-muted">{field.description}</p>}
                <p className="mt-2 text-[11px] text-muted">{field.searchable ? "قابل جستجو" : "بدون جستجو"} · {field.filterable ? "قابل فیلتر" : "بدون فیلتر"}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <Tooltip content="بالاتر" side="top"><Button type="button" variant="ghost" size="icon-sm" aria-label="انتقال فیلد به بالا" disabled={collection.status === "archived" || index === 0 || movingFieldId === field.id} onClick={() => void mutateField(field, "up")}><ArrowUp className="size-4" aria-hidden /></Button></Tooltip>
                <Tooltip content="پایین‌تر" side="top"><Button type="button" variant="ghost" size="icon-sm" aria-label="انتقال فیلد به پایین" disabled={collection.status === "archived" || index === collection.fields.length - 1 || movingFieldId === field.id} onClick={() => void mutateField(field, "down")}><ArrowDown className="size-4" aria-hidden /></Button></Tooltip>
                <Tooltip content="ویرایش" side="top"><Button type="button" variant="ghost" size="icon-sm" aria-label="ویرایش فیلد" disabled={collection.status === "archived"} onClick={() => { setEditingField(field); setFieldOpen(true); }}><Pencil className="size-4" aria-hidden /></Button></Tooltip>
                <Tooltip content={collection.recordCount > 0 ? "با وجود رکورد قابل حذف نیست" : "حذف"} side="top"><Button type="button" variant="ghost" size="icon-sm" aria-label="حذف فیلد" className="hover:text-danger" disabled={collection.status === "archived" || collection.recordCount > 0 || field.role === "title" || deletingFieldId === field.id} onClick={() => void mutateField(field, "delete")}><Trash2 className="size-4" aria-hidden /></Button></Tooltip>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="danger-heading" className="mt-8 border-t border-line pt-8">
        <h2 id="danger-heading" className="text-sm font-bold">بایگانی و حذف</h2>
        <p className="mt-1 text-xs leading-6 text-muted">بایگانی قابل بازگشت است؛ حذف کامل همه رکوردها را پاک می‌کند.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" startIcon={collection.status === "archived" ? <RefreshCw className="size-4" /> : <Archive className="size-4" />} loading={savingSettings} onClick={() => void archiveCollection()}>
            {collection.status === "archived" ? "فعال‌کردن دوباره" : "بایگانی مجموعه"}
          </Button>
          <Button type="button" variant="ghost" className="text-danger hover:text-danger" startIcon={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)}>حذف همیشگی</Button>
        </div>
      </section>

      {fieldOpen && (
        <FieldEditorModal collection={collection} field={editingField} open onOpenChange={setFieldOpen} onSaved={setCollection} />
      )}
      {visibilityOpen && (
        <AssistantVisibilityModal collection={collection} open onOpenChange={setVisibilityOpen} />
      )}
      {deleteOpen && (
        <DeleteCollectionModal collection={collection} open onOpenChange={setDeleteOpen} />
      )}
    </>
  );
};
