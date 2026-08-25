"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  ArrowRight,
  Database,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { useDashboardTitle } from "@/components/dashboard/title-context";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import type {
  BusinessDataField,
  BusinessDataRecord,
  BusinessDataRecordPage,
} from "@/lib/business-data/api-types";
import { RECORD_STATUS_LABELS } from "@/lib/business-data/api-types";
import { businessDataRequest, jsonRequest } from "@/lib/business-data/client";
import type {
  BusinessDataRecordStatus,
  BusinessDataRecordValues,
  BusinessDataScalar,
} from "@/lib/business-data/types";
import { cn, fa } from "@/lib/utils";
import { useBusinessDataCollection } from "./use-collection";

type RecordDraft = Record<string, string | number | boolean | null>;

const toInputDatetime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toDraft = (
  fields: BusinessDataField[],
  record: BusinessDataRecord | null
): RecordDraft =>
  Object.fromEntries(
    fields.map((field) => {
      const value = record?.values[field.key] ?? null;
      if (field.type === "datetime" && typeof value === "string") {
        return [field.key, toInputDatetime(value)];
      }
      return [field.key, value];
    })
  );

const normalizedDraft = (
  fields: BusinessDataField[],
  draft: RecordDraft
): BusinessDataRecordValues =>
  Object.fromEntries(
    fields.map((field) => {
      const value = draft[field.key];
      if (value === "" || value === undefined) return [field.key, null];
      if (field.type === "number" || field.type === "currency") {
        return [field.key, typeof value === "number" ? value : Number(value)];
      }
      if (field.type === "datetime" && typeof value === "string") {
        return [field.key, new Date(value).toISOString()];
      }
      return [field.key, value as BusinessDataScalar];
    })
  );

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return fa(
    new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)
  );
};

const displayValue = (field: BusinessDataField, value: BusinessDataScalar) => {
  if (value === null || value === "") return "—";
  if (field.type === "boolean") return value ? "بله" : "خیر";
  if (field.type === "currency" && typeof value === "number") {
    return `${fa(new Intl.NumberFormat("fa-IR").format(value))} تومان`;
  }
  if (field.type === "number" && typeof value === "number") {
    return fa(new Intl.NumberFormat("fa-IR").format(value));
  }
  if (field.type === "datetime" && typeof value === "string") {
    return formatDateTime(value);
  }
  if (field.type === "date" && typeof value === "string") return fa(value);
  return fa(String(value));
};

const RecordField = ({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: BusinessDataField;
  value: string | number | boolean | null;
  error?: string;
  disabled: boolean;
  onChange: (value: string | number | boolean | null) => void;
}) => {
  if (field.type === "long_text") {
    return (
      <Textarea
        id={`record-${field.id}`}
        label={field.label}
        hint={field.description}
        error={error}
        required={field.required}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        maxLength={field.validation?.maxLength ?? 4000}
        rows={4}
      />
    );
  }
  if (field.type === "select") {
    return (
      <Select
        id={`record-${field.id}`}
        label={field.label}
        hint={field.description}
        error={error}
        required={field.required}
        value={typeof value === "string" ? value : undefined}
        onChange={onChange}
        disabled={disabled}
        options={(field.validation?.options ?? []).map((option) => ({
          value: option,
          label: option,
        }))}
      />
    );
  }
  if (field.type === "boolean") {
    return (
      <div className="rounded-2xl border border-line bg-surface/35 p-4">
        <Checkbox
          id={`record-${field.id}`}
          label={field.label}
          description={field.description}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
      </div>
    );
  }
  const inputType =
    field.type === "number" || field.type === "currency"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "datetime"
          ? "datetime-local"
          : field.type === "url"
            ? "url"
            : "text";
  return (
    <Input
      id={`record-${field.id}`}
      type={inputType}
      dir={field.type === "url" ? "ltr" : undefined}
      label={field.label}
      hint={field.description}
      error={error}
      required={field.required}
      value={typeof value === "boolean" || value === null ? "" : value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      min={field.validation?.min}
      max={field.validation?.max}
      step={
        field.type === "number" || field.type === "currency"
          ? 1 / 10 ** (field.validation?.decimalPlaces ?? 8)
          : undefined
      }
      maxLength={
        field.type === "text" || field.type === "url"
          ? field.validation?.maxLength
          : undefined
      }
    />
  );
};

const RecordEditorModal = ({
  collectionId,
  fields,
  record,
  open,
  onOpenChange,
  onSaved,
}: {
  collectionId: string;
  fields: BusinessDataField[];
  record: BusinessDataRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) => {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<RecordDraft>(() =>
    toDraft(fields, record)
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const value = draft[field.key];
      if (field.required && (value === null || value === "" || value === undefined)) {
        nextErrors[field.key] = "این فیلد الزامی است.";
      }
      if (
        (field.type === "number" || field.type === "currency") &&
        value !== null &&
        value !== "" &&
        !Number.isFinite(Number(value))
      ) {
        nextErrors[field.key] = "یک عدد معتبر وارد کنید.";
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const base = `/api/business-data/collections/${collectionId}/records`;
      await businessDataRequest(
        record ? `${base}/${record.id}` : base,
        jsonRequest(record ? "PATCH" : "POST", {
          values: normalizedDraft(fields, draft),
        })
      );
      toast({
        title: record ? "رکورد به‌روز شد" : "رکورد ساخته شد",
        variant: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (caught) {
      toast({
        title: "ذخیره رکورد انجام نشد",
        description: caught instanceof Error ? caught.message : undefined,
        variant: "error",
      });
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
          <ModalTitle>{record ? "ویرایش رکورد" : "رکورد جدید"}</ModalTitle>
          <ModalDescription>
            مقادیر را مطابق ساختار مجموعه وارد کنید. فیلدهای ستاره‌دار الزامی‌اند.
          </ModalDescription>
        </ModalHeader>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
            {fields.map((field) => (
              <RecordField
                key={field.id}
                field={field}
                value={draft[field.key] ?? null}
                error={errors[field.key]}
                disabled={saving}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, [field.key]: value }));
                  setErrors((current) => ({ ...current, [field.key]: "" }));
                }}
              />
            ))}
          </div>
          <ModalFooter className="mt-0 shrink-0 flex-col-reverse border-t border-line px-5 py-4 sm:flex-row sm:px-7 sm:py-5">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {record ? "ذخیره تغییرات" : "ساخت رکورد"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const DeleteRecordModal = ({
  record,
  deleting,
  onConfirm,
  onOpenChange,
}: {
  record: BusinessDataRecord | null;
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => (
  <Modal open={Boolean(record)} onOpenChange={(open) => !deleting && onOpenChange(open)}>
    <ModalContent size="sm" closeDisabled={deleting}>
      <ModalHeader>
        <ModalTitle>حذف همیشگی رکورد؟</ModalTitle>
        <ModalDescription>
          این کار قابل بازگشت نیست. اگر فقط فعلاً به رکورد نیاز ندارید، آن را بایگانی کنید.
        </ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button type="button" variant="ghost" disabled={deleting} onClick={() => onOpenChange(false)}>انصراف</Button>
        <Button type="button" variant="danger" loading={deleting} onClick={onConfirm}>حذف همیشگی</Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

export const BusinessDataRecordsPanel = ({ collectionId }: { collectionId: string }) => {
  const router = useRouter();
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const { collection, loading: collectionLoading, error: collectionError, reload: reloadCollection } =
    useBusinessDataCollection(collectionId);
  const [pageData, setPageData] = React.useState<BusinessDataRecordPage | null>(null);
  const [recordsLoading, setRecordsLoading] = React.useState(true);
  const [recordsError, setRecordsError] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"all" | BusinessDataRecordStatus>("active");
  const [sort, setSort] = React.useState("updated_desc");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingRecord, setEditingRecord] = React.useState<BusinessDataRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = React.useState<BusinessDataRecord | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  useDashboardTitle(collection?.name ?? null);

  const loadRecords = React.useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        status,
        sort,
      });
      if (query) params.set("q", query);
      const data = await businessDataRequest<{ page: BusinessDataRecordPage }>(
        `/api/business-data/collections/${collectionId}/records?${params}`
      );
      if (data.page.page > data.page.totalPages) {
        setPage(data.page.totalPages);
        return;
      }
      setPageData(data.page);
    } catch (caught) {
      setRecordsError(caught instanceof Error ? caught.message : "رکوردها بارگذاری نشد.");
    } finally {
      setRecordsLoading(false);
    }
  }, [collectionId, page, query, sort, status]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  const refresh = () => {
    void Promise.all([loadRecords(), reloadCollection()]);
  };

  const changeStatus = async (record: BusinessDataRecord) => {
    setBusyId(record.id);
    const next = record.status === "active" ? "archived" : "active";
    try {
      await businessDataRequest(
        `/api/business-data/collections/${collectionId}/records/${record.id}`,
        jsonRequest("PATCH", { status: next })
      );
      toast({
        title: next === "archived" ? "رکورد بایگانی شد" : "رکورد بازگردانده شد",
        variant: "success",
      });
      refresh();
    } catch (caught) {
      toast({
        title: "تغییر وضعیت انجام نشد",
        description: caught instanceof Error ? caught.message : undefined,
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deletingRecord) return;
    setDeleting(true);
    try {
      await businessDataRequest(
        `/api/business-data/collections/${collectionId}/records/${deletingRecord.id}`,
        jsonRequest("DELETE")
      );
      setDeletingRecord(null);
      toast({ title: "رکورد حذف شد", variant: "success" });
      refresh();
    } catch (caught) {
      toast({
        title: "حذف رکورد انجام نشد",
        description: caught instanceof Error ? caught.message : undefined,
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (collectionLoading) {
    return (
      <div role="status" aria-label="در حال بارگذاری مجموعه">
        <div className="flex items-start gap-4"><Skeleton className="size-11 rounded-2xl" /><SkeletonText className="flex-1" lines={2} /></div>
        <div className="mt-8 rounded-3xl border border-line bg-surface/30 p-5"><SkeletonText lines={8} /></div>
      </div>
    );
  }

  if (collectionError || !collection) {
    return (
      <Alert variant="error" title="مجموعه بارگذاری نشد" description={collectionError}>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" startIcon={<RefreshCw className="size-4" />} onClick={() => void reloadCollection()}>تلاش دوباره</Button>
          <Button type="button" size="sm" variant="ghost" startIcon={<ArrowRight className="size-4" />} onClick={() => router.push("/dashboard/data")}>بازگشت</Button>
        </div>
      </Alert>
    );
  }

  const titleField = collection.fields.find((field) => field.role === "title") ?? collection.fields[0];
  const visibleFields = [titleField, ...collection.fields.filter((field) => field.id !== titleField.id)];
  const searchSupported = collection.fields.some(
    (field) => field.searchable && field.aiExposure !== "hidden"
  );
  const records = pageData?.records ?? [];

  return (
    <>
      <DashboardPageHeader
        title={collection.name}
        description={collection.description || "رکوردهای این مجموعه را به‌صورت دستی مدیریت کنید."}
        icon={Database}
        count={pageData?.total ?? collection.recordCount}
        action={
          <Button
            type="button"
            startIcon={<Plus className="size-4" />}
            onClick={() => { setEditingRecord(null); setEditorOpen(true); }}
            disabled={collection.status === "archived"}
            className="w-full sm:w-auto"
          >
            رکورد جدید
          </Button>
        }
      />

      {collection.status === "archived" && (
        <Alert variant="default" title="این مجموعه بایگانی شده است" description="برای افزودن یا ویرایش رکورد، مجموعه را از بخش ساختار و دسترسی فعال کنید." className="mb-5" />
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <form
          onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}
          className="flex items-end gap-2"
        >
          <Input
            id="business-data-record-search"
            label="جستجو"
            placeholder={searchSupported ? "جستجو در رکوردها…" : "برای این ساختار جستجو فعال نیست"}
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            startIcon={<Search className="size-4" />}
            disabled={!searchSupported}
          />
          <Button type="submit" variant="outline" size="icon" aria-label="جستجو" disabled={!searchSupported}>
            <Search className="size-4" aria-hidden />
          </Button>
        </form>
        <Select
          id="business-data-record-status"
          label="وضعیت"
          value={status}
          onChange={(value) => { setStatus(value as typeof status); setPage(1); }}
          options={[
            { value: "active", label: "رکوردهای فعال" },
            { value: "archived", label: "بایگانی‌شده‌ها" },
            { value: "all", label: "همه رکوردها" },
          ]}
        />
        <Select
          id="business-data-record-sort"
          label="ترتیب"
          value={sort}
          onChange={(value) => { setSort(value); setPage(1); }}
          options={[
            { value: "updated_desc", label: "تازه‌ترین تغییر" },
            { value: "updated_asc", label: "قدیمی‌ترین تغییر" },
            { value: "created_desc", label: "تازه‌ترین ساخت" },
          ]}
        />
      </div>

      {recordsError && (
        <Alert variant="error" title="رکوردها بارگذاری نشد" description={recordsError} className="mb-5">
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void loadRecords()}>تلاش دوباره</Button>
        </Alert>
      )}

      {recordsLoading && (
        <div role="status" aria-label="در حال بارگذاری رکوردها" className="space-y-2">
          {[0, 1, 2, 3].map((item) => <div key={item} className="rounded-2xl border border-line bg-surface/30 p-4"><SkeletonText lines={2} /></div>)}
        </div>
      )}

      {!recordsLoading && !recordsError && records.length === 0 && (
        <EmptyState
          icon={query || status !== "active" ? Search : Database}
          tone={query || status !== "active" ? "muted" : "accent"}
          title={query || status !== "active" ? "رکوردی پیدا نشد" : "هنوز رکوردی ندارید"}
          description={query || status !== "active" ? "عبارت جستجو یا فیلتر را تغییر دهید." : "اولین مورد را دستی اضافه کنید؛ ویرایش گروهی و اتصال فایل در مرحله‌های بعد می‌آید."}
          action={
            !query && status === "active" && collection.status !== "archived" ? (
              <Button type="button" startIcon={<Plus className="size-4" />} onClick={() => { setEditingRecord(null); setEditorOpen(true); }}>رکورد جدید</Button>
            ) : undefined
          }
        />
      )}

      {!recordsLoading && !recordsError && records.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="bg-surface/60 text-xs text-muted">
                  <tr>
                    {visibleFields.map((field) => <th key={field.id} scope="col" className="px-4 py-3 text-start font-medium">{field.label}</th>)}
                    <th scope="col" className="px-4 py-3 text-start font-medium">وضعیت</th>
                    <th scope="col" className="w-28 px-4 py-3 text-end font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface/20">
                  <AnimatePresence initial={false}>
                    {records.map((record) => (
                      <motion.tr
                        key={record.id}
                        layout={!reduce}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="transition-colors hover:bg-surface/45"
                      >
                        {visibleFields.map((field) => (
                          <td key={field.id} className={cn("max-w-56 truncate px-4 py-3", field.id === titleField.id && "font-medium")} title={displayValue(field, record.values[field.key] ?? null)}>
                            {displayValue(field, record.values[field.key] ?? null)}
                          </td>
                        ))}
                        <td className="px-4 py-3"><Badge variant={record.status === "active" ? "success" : "muted"}>{RECORD_STATUS_LABELS[record.status]}</Badge></td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            <Tooltip content="ویرایش" side="top"><Button type="button" variant="ghost" size="icon-sm" aria-label="ویرایش رکورد" onClick={() => { setEditingRecord(record); setEditorOpen(true); }} disabled={busyId === record.id || collection.status === "archived"}><Pencil className="size-4" aria-hidden /></Button></Tooltip>
                            <Tooltip content={record.status === "active" ? "بایگانی" : "بازگردانی"} side="top"><Button type="button" variant="ghost" size="icon-sm" aria-label={record.status === "active" ? "بایگانی رکورد" : "بازگردانی رکورد"} onClick={() => void changeStatus(record)} disabled={busyId === record.id || collection.status === "archived"}>{record.status === "active" ? <Archive className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}</Button></Tooltip>
                            <Tooltip content="حذف همیشگی" side="top"><Button type="button" variant="ghost" size="icon-sm" aria-label="حذف همیشگی رکورد" className="hover:text-danger" onClick={() => setDeletingRecord(record)} disabled={busyId === record.id}><Trash2 className="size-4" aria-hidden /></Button></Tooltip>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>

          <ul className="space-y-2 sm:hidden">
            {records.map((record) => (
              <li key={record.id} className="rounded-2xl border border-line bg-surface/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{displayValue(titleField, record.values[titleField.key] ?? null)}</p>
                    <dl className="mt-3 space-y-2">
                      {visibleFields.slice(1).map((field) => (
                        <div key={field.id} className="flex gap-3 text-xs"><dt className="w-24 shrink-0 text-muted">{field.label}</dt><dd className="min-w-0 flex-1 truncate">{displayValue(field, record.values[field.key] ?? null)}</dd></div>
                      ))}
                    </dl>
                  </div>
                  <Badge variant={record.status === "active" ? "success" : "muted"}>{RECORD_STATUS_LABELS[record.status]}</Badge>
                </div>
                <div className="mt-4 flex gap-2 border-t border-line pt-3">
                  <Button type="button" size="sm" variant="outline" startIcon={<Pencil className="size-3.5" />} onClick={() => { setEditingRecord(record); setEditorOpen(true); }} disabled={collection.status === "archived"}>ویرایش</Button>
                  <Button type="button" size="sm" variant="ghost" startIcon={record.status === "active" ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={() => void changeStatus(record)} disabled={busyId === record.id || collection.status === "archived"}>{record.status === "active" ? "بایگانی" : "بازگردانی"}</Button>
                  <Button type="button" size="icon-sm" variant="ghost" className="ms-auto hover:text-danger" aria-label="حذف همیشگی رکورد" onClick={() => setDeletingRecord(record)}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-line pt-5 sm:flex-row">
            <p className="text-xs text-muted">صفحه {fa(pageData?.page ?? 1)} از {fa(pageData?.totalPages ?? 1)} · {fa(pageData?.total ?? 0)} رکورد</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={(pageData?.page ?? 1) <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>صفحه قبل</Button>
              <Button type="button" size="sm" variant="outline" disabled={(pageData?.page ?? 1) >= (pageData?.totalPages ?? 1)} onClick={() => setPage((current) => current + 1)}>صفحه بعد</Button>
            </div>
          </div>
        </>
      )}

      {editorOpen && (
        <RecordEditorModal
          collectionId={collectionId}
          fields={collection.fields}
          record={editingRecord}
          open
          onOpenChange={setEditorOpen}
          onSaved={refresh}
        />
      )}
      <DeleteRecordModal record={deletingRecord} deleting={deleting} onConfirm={() => void confirmDelete()} onOpenChange={(open) => !open && setDeletingRecord(null)} />
    </>
  );
};
