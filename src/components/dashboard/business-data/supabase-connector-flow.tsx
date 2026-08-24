"use client";

import * as React from "react";
import { CheckCircle2, Database, KeyRound, RefreshCw, Table2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Steps } from "@/components/ui/steps";
import {
  FIELD_TYPE_LABELS,
  type BusinessDataCollectionDetail,
  type BusinessDataField,
} from "@/lib/business-data/api-types";
import { businessDataRequest, jsonRequest } from "@/lib/business-data/client";
import { selectProposedImportFields } from "@/lib/business-data/import-plan";
import type {
  BusinessDataFieldDefinition,
  BusinessDataFieldType,
} from "@/lib/business-data/types";
import { fa } from "@/lib/utils";

type DiscoveredTable = {
  name: string;
  columns: Array<{ name: string; type: string }>;
  approximateRowCount: number | null;
  suggestedPurpose: string | null;
};

type SupabasePreview = {
  sourceType: "supabase";
  sourceName: string;
  sheetName: string;
  columns: Array<{
    key: string;
    label: string;
    type: keyof typeof FIELD_TYPE_LABELS;
    confidence: "high" | "medium" | "low";
    uniqueCandidate: boolean;
  }>;
  sampleRows: Array<{ rowNumber: number; values: Record<string, string> }>;
  rowCount: number;
  warnings: string[];
  validCount: number;
  rejectedCount: number;
  rejectedRows: Array<{ rowNumber: number; message: string }>;
};

const STEPS = [
  { id: "connection", label: "اتصال" },
  { id: "table", label: "انتخاب جدول" },
  { id: "mapping", label: "تطبیق فیلدها" },
  { id: "sync", label: "همگام‌سازی" },
];

const makeIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;

const confidenceLabel = (value: SupabasePreview["columns"][number]["confidence"]) =>
  value === "high" ? "پیشنهاد مطمئن" : value === "medium" ? "نیازمند بررسی" : "انتخاب نشده";

export const SupabaseConnectorFlow = ({
  collection,
  open,
  onOpenChange,
  onSynced,
}: {
  collection: BusinessDataCollectionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSynced: () => void;
}) => {
  const [projectUrl, setProjectUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [tables, setTables] = React.useState<DiscoveredTable[]>([]);
  const [tableName, setTableName] = React.useState("");
  const [preview, setPreview] = React.useState<SupabasePreview | null>(null);
  const [fields, setFields] = React.useState<BusinessDataField[]>(collection.fields);
  const [newFields, setNewFields] = React.useState<BusinessDataFieldDefinition[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string | null>>({});
  const [externalIdField, setExternalIdField] = React.useState("");
  const [result, setResult] = React.useState<{
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
  } | null>(null);
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [connectionMessage, setConnectionMessage] = React.useState("");
  const idempotencyRef = React.useRef(makeIdempotencyKey());

  const reset = () => {
    setProjectUrl("");
    setApiKey("");
    setTables([]);
    setTableName("");
    setPreview(null);
    setFields(collection.fields);
    setNewFields([]);
    setMapping({});
    setExternalIdField("");
    setResult(null);
    setStep(0);
    setBusy(false);
    setError("");
    setConnectionMessage("");
    idempotencyRef.current = makeIdempotencyKey();
  };

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const testConnection = async () => {
    setBusy(true);
    setError("");
    setConnectionMessage("");
    try {
      const response = await businessDataRequest<{
        message: string;
        tables: DiscoveredTable[];
      }>(
        "/api/business-data/supabase/test",
        jsonRequest("POST", {
          collectionId: collection.id,
          projectUrl,
          apiKey,
        })
      );
      setTables(response.tables);
      setTableName(response.tables[0]?.name ?? "");
      setConnectionMessage(response.message);
      setStep(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "بررسی اتصال انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  const connectTable = async () => {
    if (!tableName) {
      setError("یک جدول را انتخاب کنید.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await businessDataRequest<{
        preview: {
          preview: SupabasePreview;
          fields: BusinessDataField[];
          newFields: BusinessDataFieldDefinition[];
          mapping: Record<string, string | null>;
          externalIdField: string | null;
        };
      }>(
        "/api/business-data/supabase/connect",
        jsonRequest("POST", {
          collectionId: collection.id,
          projectUrl,
          apiKey,
          tableName,
        })
      );
      setPreview(response.preview.preview);
      setFields(response.preview.fields);
      setNewFields(response.preview.newFields);
      setMapping(response.preview.mapping);
      setExternalIdField(response.preview.externalIdField ?? "");
      setApiKey("");
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ثبت اتصال انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setError("");
    try {
      const selectedNewFields = selectProposedImportFields(
        newFields,
        mapping,
        fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          role: field.role,
          required: field.required,
          searchable: field.searchable,
          filterable: field.filterable,
          aiExposure: field.aiExposure,
          position: field.position,
        }))
      );
      const response = await businessDataRequest<{
        result: {
          insertedCount: number;
          updatedCount: number;
          skippedCount: number;
          failedCount: number;
        };
      }>(
        "/api/business-data/supabase/sync",
        jsonRequest("POST", {
          collectionId: collection.id,
          mapping,
          newFields: selectedNewFields,
          externalIdField: externalIdField || null,
          idempotencyKey: idempotencyRef.current,
        })
      );
      setResult(response.result);
      setStep(3);
      onSynced();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "همگام‌سازی انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  const allFields = [...fields, ...selectProposedImportFields(
    newFields,
    mapping,
    fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      role: field.role,
      required: field.required,
      searchable: field.searchable,
      filterable: field.filterable,
      aiExposure: field.aiExposure,
      position: field.position,
    }))
  )];
  const newFieldKeys = new Set(newFields.map((field) => field.key));

  const updateMapping = (columnKey: string, value: string) => {
    const next = { ...mapping, [columnKey]: value || null };
    if (externalIdField === mapping[columnKey] && externalIdField !== value) {
      setExternalIdField("");
    }
    setMapping(next);
  };

  const updateNewFieldType = (key: string, type: BusinessDataFieldType) => {
    setNewFields((current) =>
      current.map((field) => (field.key === key ? { ...field, type } : field))
    );
  };

  return (
    <Modal open={open} onOpenChange={close}>
      <ModalContent size="xl" closeDisabled={busy} className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0">
        <ModalHeader className="mb-0 shrink-0 border-b border-line px-5 pb-4 pt-5 sm:px-7 sm:pt-7">
          <ModalTitle>اتصال Supabase</ModalTitle>
          <ModalDescription>
            یک جدول از پروژه Supabase را به همین مجموعه وصل کنید و هر زمان خواستید داده‌ها را به‌روز کنید.
          </ModalDescription>
          <Steps steps={STEPS} current={step} orientation="horizontal" label="مراحل اتصال Supabase" className="mt-5" />
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
          {error && <Alert variant="error" title="عملیات انجام نشد" description={error} className="mb-5" />}

          {step === 0 && (
            <div className="mx-auto max-w-xl space-y-5">
              <div className="rounded-3xl border border-line bg-surface/25 p-5">
                <div className="flex items-start gap-3">
                  <Database className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                  <div>
                    <h3 className="font-bold">اطلاعات پروژه</h3>
                    <p className="mt-1 text-xs leading-6 text-muted">
                      آدرس پروژه را از تنظیمات API و کلید Secret را از بخش API Keys بردارید. کلید فقط در سرور و به‌صورت رمزگذاری‌شده نگهداری می‌شود.
                    </p>
                  </div>
                </div>
                <Input
                  id="supabase-project-url"
                  className="mt-5"
                  dir="ltr"
                  label="آدرس پروژه Supabase"
                  placeholder="https://project-ref.supabase.co"
                  value={projectUrl}
                  onChange={(event) => setProjectUrl(event.target.value)}
                  autoComplete="url"
                  startIcon={<Database className="size-4" />}
                />
                <Input
                  id="supabase-secret-key"
                  className="mt-4"
                  dir="ltr"
                  type="password"
                  label="Secret key یا service_role key"
                  hint="این کلید در مرورگر ذخیره نمی‌شود و پس از ثبت از فرم پاک می‌شود."
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="new-password"
                  startIcon={<KeyRound className="size-4" />}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              {connectionMessage && (
                <Alert variant="success" title={connectionMessage} description="حالا جدولی را انتخاب کنید که باید وارد این مجموعه شود." />
              )}
              {tables.length === 0 ? (
                <Alert
                  variant="warning"
                  title="جدولی برای خواندن پیدا نشد"
                  description="در تنظیمات Data API بررسی کنید که schema و جدول موردنظر در دسترس باشند."
                />
              ) : (
                <section aria-labelledby="supabase-table-heading">
                  <h3 id="supabase-table-heading" className="text-sm font-bold">جدول موردنظر</h3>
                  <p className="mt-1 text-xs leading-6 text-muted">فقط یک جدول به این مجموعه وصل می‌شود. برای جدول دیگر، یک مجموعه جدا بسازید.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {tables.map((table) => {
                      const selected = table.name === tableName;
                      return (
                        <button
                          key={table.name}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setTableName(table.name)}
                          className={`rounded-2xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${selected ? "border-accent/50 bg-accent/10" : "border-line bg-surface/20 hover:bg-surface/45"}`}
                        >
                          <span className="flex items-center gap-2">
                            <Table2 className="size-4 shrink-0 text-muted" aria-hidden />
                            <bdi dir="ltr" className="truncate font-medium">{table.name}</bdi>
                            {selected && <CheckCircle2 className="ms-auto size-4 shrink-0 text-accent" aria-hidden />}
                          </span>
                          <span className="mt-2 block text-xs text-muted">
                            {table.suggestedPurpose ? `پیشنهاد: ${table.suggestedPurpose}` : "کاربرد را با فیلدها مشخص می‌کنید"}
                            {table.approximateRowCount !== null ? ` · حدود ${fa(table.approximateRowCount)} ردیف` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}

          {step === 2 && preview && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-line bg-surface/25 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold"><bdi dir="ltr">{preview.sourceName}</bdi></h3>
                    <p className="mt-1 text-sm text-muted">
                      {fa(preview.rowCount)} ردیف خوانده شد؛ {fa(preview.validCount)} ردیف با تطبیق فعلی آماده است.
                    </p>
                  </div>
                  <Badge variant={preview.rejectedCount ? "warning" : "success"}>
                    {preview.rejectedCount ? `${fa(preview.rejectedCount)} ردیف نیازمند بررسی` : "آماده همگام‌سازی"}
                  </Badge>
                </div>
                {preview.warnings.map((warning) => (
                  <Alert key={warning} variant="warning" title="تطبیق را بررسی کنید" description={warning} className="mt-4" />
                ))}
              </section>

              <section aria-labelledby="supabase-mapping-heading">
                <h3 id="supabase-mapping-heading" className="text-sm font-bold">تطبیق فیلدها</h3>
                <p className="mt-1 text-xs leading-6 text-muted">هر ستون را به یک فیلد موجود وصل کنید، فیلد پیشنهادی بسازید یا نادیده بگیرید.</p>
                <div className="mt-3 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface/20">
                  {preview.columns.map((column) => (
                    <div key={column.key} className="grid gap-3 p-4 sm:grid-cols-2 sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <bdi dir="ltr" className="font-medium">{column.label}</bdi>
                          <Badge variant={column.confidence === "high" ? "success" : column.confidence === "medium" ? "warning" : "muted"}>
                            {confidenceLabel(column.confidence)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          نوع پیشنهادی: {FIELD_TYPE_LABELS[column.type]}{column.uniqueCandidate ? " · شناسه احتمالی" : ""}
                        </p>
                      </div>
                      <div className="space-y-3">
                        <Select
                          id={`supabase-mapping-${column.key}`}
                          label={`فیلد پشتیبان برای ${column.label}`}
                          value={mapping[column.key] ?? ""}
                          onChange={(value) => updateMapping(column.key, value)}
                          options={[
                            { value: "", label: "نادیده گرفتن این ستون" },
                            ...fields.map((field) => ({ value: field.key, label: field.label })),
                            ...newFields.map((field) => ({ value: field.key, label: `ایجاد فیلد جدید: ${field.label}` })),
                          ]}
                        />
                        {mapping[column.key] && newFieldKeys.has(mapping[column.key]!) && (
                          <Select
                            id={`supabase-new-field-type-${column.key}`}
                            label="نوع فیلد جدید"
                            value={newFields.find((field) => field.key === mapping[column.key])?.type ?? column.type}
                            onChange={(value) => updateNewFieldType(mapping[column.key]!, value as BusinessDataFieldType)}
                            options={Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <Select
                id="supabase-identifier"
                label="شناسه یکتا برای به‌روزرسانی بعدی"
                value={externalIdField}
                onChange={setExternalIdField}
                options={[
                  { value: "", label: "یک فیلد یکتا را انتخاب کنید" },
                  ...allFields.map((field) => ({ value: field.key, label: field.label })),
                ]}
                hint="این انتخاب الزامی است؛ یک شناسه ثابت مثل id، کد محصول یا شماره سفارش باعث می‌شود همگام‌سازی بعدی همان رکورد را به‌روزرسانی کند."
              />

              <section aria-labelledby="supabase-sample-heading" className="overflow-hidden rounded-3xl border border-line">
                <h3 id="supabase-sample-heading" className="border-b border-line px-4 py-3 text-sm font-bold">نمونه داده</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-right text-xs">
                    <thead className="bg-surface/45 text-muted"><tr>{preview.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3 font-medium"><bdi dir="ltr">{column.label}</bdi></th>)}</tr></thead>
                    <tbody className="divide-y divide-line">{preview.sampleRows.map((row) => <tr key={row.rowNumber}>{preview.columns.map((column) => <td key={column.key} className="max-w-40 truncate px-3 py-3">{row.values[column.key] || "—"}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {step === 3 && result && (
            <div className="mx-auto max-w-xl rounded-3xl border border-success/30 bg-success/10 p-6 text-center">
              <CheckCircle2 className="mx-auto size-9 text-success" aria-hidden />
              <h3 className="mt-4 text-lg font-bold">همگام‌سازی انجام شد</h3>
              <p className="mt-2 text-sm leading-7 text-muted">
                {fa(result.insertedCount)} رکورد وارد شد، {fa(result.updatedCount)} رکورد به‌روزرسانی شد و {fa(result.skippedCount)} رکورد تغییری نداشت.
              </p>
              {result.failedCount > 0 && <p className="mt-2 text-xs text-warning">{fa(result.failedCount)} ردیف به دلیل اطلاعات نامعتبر وارد نشد.</p>}
            </div>
          )}
        </div>

        <ModalFooter className="shrink-0 border-t border-line px-5 py-4 sm:px-7">
          {step === 0 && <Button type="button" onClick={() => void testConnection()} loading={busy} startIcon={<RefreshCw className="size-4" />}>تست اتصال</Button>}
          {step === 1 && <><Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>ویرایش اتصال</Button><Button type="button" onClick={() => void connectTable()} loading={busy} disabled={!tableName} startIcon={<Table2 className="size-4" />}>انتخاب و ادامه</Button></>}
          {step === 2 && <><Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={busy}>انتخاب جدول دیگر</Button><Button type="button" onClick={() => void sync()} loading={busy} disabled={!externalIdField} startIcon={<RefreshCw className="size-4" />}>تأیید و همگام‌سازی</Button></>}
          {step === 3 && <Button type="button" onClick={() => close(false)}>بستن</Button>}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
