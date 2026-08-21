"use client";

import * as React from "react";
import { CheckCircle2, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
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
import { businessDataRequest } from "@/lib/business-data/client";
import type { BusinessDataCollectionDetail } from "@/lib/business-data/api-types";
import { FIELD_TYPE_LABELS } from "@/lib/business-data/api-types";
import { fa } from "@/lib/utils";

type ImportPreview = {
  sourceType: "csv" | "excel";
  sourceName: string;
  sheetName: string | null;
  sheetNames: string[];
  columns: Array<{
    key: string;
    label: string;
    type: keyof typeof FIELD_TYPE_LABELS;
    role: string;
    confidence: "high" | "medium" | "low";
    uniqueCandidate: boolean;
  }>;
  sampleRows: Array<{ rowNumber: number; values: Record<string, string> }>;
  rowCount: number;
  warnings: string[];
  validCount: number;
  rejectedCount: number;
  rejectedRows: Array<{ rowNumber: number; message: string }>;
  hasStableIdentifier: boolean;
};

const STEPS = [
  { id: "file", label: "انتخاب فایل" },
  { id: "mapping", label: "تطبیق اطلاعات" },
  { id: "confirm", label: "تأیید و ورود" },
];

const confidenceLabel = (value: ImportPreview["columns"][number]["confidence"]) =>
  value === "high" ? "پیشنهاد مطمئن" : value === "medium" ? "نیازمند بررسی" : "انتخاب نشده";

const makeIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;

export const FileImportFlow = ({
  collection,
  open,
  onOpenChange,
  onImported,
}: {
  collection: BusinessDataCollectionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) => {
  const [file, setFile] = React.useState<File | null>(null);
  const [sheetName, setSheetName] = React.useState("");
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string | null>>({});
  const [externalIdField, setExternalIdField] = React.useState<string>("");
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<{
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
  } | null>(null);
  const idempotencyRef = React.useRef(makeIdempotencyKey());

  const reset = () => {
    setFile(null);
    setSheetName("");
    setPreview(null);
    setMapping({});
    setExternalIdField("");
    setStep(0);
    setBusy(false);
    setError("");
    setResult(null);
    idempotencyRef.current = makeIdempotencyKey();
  };

  const close = (next: boolean) => {
    if (!busy) {
      if (!next) reset();
      onOpenChange(next);
    }
  };

  const loadPreview = async (nextFile = file, nextSheet = sheetName) => {
    if (!nextFile) {
      setError("ابتدا فایل CSV یا Excel را انتخاب کنید.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", nextFile);
      form.set("collectionId", collection.id);
      if (nextSheet) form.set("sheetName", nextSheet);
      const response = await businessDataRequest<{
        preview: ImportPreview;
        mapping: Record<string, string | null>;
        externalIdField: string | null;
      }>("/api/business-data/imports/file/preview", { method: "POST", body: form });
      setPreview(response.preview);
      setMapping(response.mapping);
      setExternalIdField(response.externalIdField ?? "");
      setSheetName(response.preview.sheetName ?? "");
      setStep(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "پیش‌نمایش فایل آماده نشد.");
    } finally {
      setBusy(false);
    }
  };

  const changeSheet = async (value: string) => {
    setSheetName(value);
    if (file) await loadPreview(file, value);
  };

  const confirm = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("collectionId", collection.id);
      form.set("sheetName", sheetName);
      form.set("mapping", JSON.stringify(mapping));
      form.set("externalIdField", externalIdField);
      form.set("idempotencyKey", idempotencyRef.current);
      const response = await businessDataRequest<{
        result: { insertedCount: number; updatedCount: number; skippedCount: number; failedCount: number };
      }>("/api/business-data/imports/file/commit", { method: "POST", body: form });
      setResult(response.result);
      setStep(2);
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ورود داده انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={close}>
      <ModalContent size="xl" closeDisabled={busy} className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0">
        <ModalHeader className="mb-0 shrink-0 border-b border-line px-5 pb-4 pt-5 sm:px-7 sm:pt-7">
          <ModalTitle>ورود از فایل</ModalTitle>
          <ModalDescription>فایل را بررسی می‌کنیم، تطبیق پیشنهادی را نشان می‌دهیم و فقط بعد از تأیید شما داده‌ها وارد می‌شوند.</ModalDescription>
          <Steps steps={STEPS} current={step} orientation="horizontal" label="مراحل ورود فایل" className="mt-5" />
        </ModalHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
          {error && <Alert variant="error" title="عملیات انجام نشد" description={error} className="mb-5" />}
          {step === 0 && (
            <div className="mx-auto max-w-xl">
              <div className="rounded-3xl border border-dashed border-line bg-surface/25 p-6 text-center sm:p-8">
                <FileSpreadsheet className="mx-auto size-8 text-accent" aria-hidden />
                <h3 className="mt-4 text-base font-bold">فایل CSV یا Excel را انتخاب کنید</h3>
                <p className="mt-2 text-sm leading-7 text-muted">تا {fa(5)} مگابایت و {fa(2000)} ردیف. فایل فقط برای همین ورود خوانده می‌شود و ذخیره نمی‌شود.</p>
                <Input id="business-data-import-file" className="mt-5 text-start" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" label="فایل داده" onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); setError(""); }} />
                {file && <p className="mt-3 text-xs text-muted">{file.name} · {fa(Math.ceil(file.size / 1024))} کیلوبایت</p>}
              </div>
            </div>
          )}
          {step === 1 && preview && (
            <div className="space-y-6">
              <section className="rounded-3xl border border-line bg-surface/25 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-bold">{preview.sourceName}</h3><p className="mt-1 text-sm text-muted">{fa(preview.rowCount)} ردیف شناسایی شد؛ {fa(preview.validCount)} ردیف با تطبیق فعلی آماده ورود است.</p></div>
                  <Badge variant={preview.rejectedCount ? "warning" : "success"}>{preview.rejectedCount ? `${fa(preview.rejectedCount)} ردیف نیازمند بررسی` : "آماده ورود"}</Badge>
                </div>
                {preview.sheetNames.length > 1 && <Select id="import-sheet" label="برگه فایل" className="mt-5" value={sheetName} onChange={(value) => void changeSheet(value)} options={preview.sheetNames.map((name) => ({ value: name, label: name }))} />}
                {preview.warnings.map((warning) => <Alert key={warning} variant="warning" title="تطبیق را بررسی کنید" description={warning} className="mt-4" />)}
              </section>
              <section aria-labelledby="mapping-heading">
                <h3 id="mapping-heading" className="text-sm font-bold">تطبیق اطلاعات</h3>
                <p className="mt-1 text-xs leading-6 text-muted">هر ستون فایل را به یکی از فیلدهای همین مجموعه وصل کنید یا آن را نادیده بگیرید.</p>
                <div className="mt-3 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface/20">
                  {preview.columns.map((column) => (
                    <div key={column.key} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{column.label}</span><Badge variant={column.confidence === "high" ? "success" : column.confidence === "medium" ? "warning" : "muted"}>{confidenceLabel(column.confidence)}</Badge></div><p className="mt-1 text-xs text-muted">نوع پیشنهادی: {FIELD_TYPE_LABELS[column.type]}{column.uniqueCandidate ? " · شناسه احتمالی" : ""}</p></div>
                      <Select id={`mapping-${column.key}`} label={`فیلد پشتیبان برای ${column.label}`} value={mapping[column.key] ?? ""} onChange={(value) => setMapping((current) => ({ ...current, [column.key]: value || null }))} options={[{ value: "", label: "نادیده گرفتن این ستون" }, ...collection.fields.map((field) => ({ value: field.key, label: field.label }))]} />
                    </div>
                  ))}
                </div>
              </section>
              <Select id="import-identifier" label="شناسه یکتا برای به‌روزرسانی بعدی" value={externalIdField} onChange={setExternalIdField} options={[{ value: "", label: "شناسه قابل اتکا ندارم" }, ...collection.fields.map((field) => ({ value: field.key, label: field.label }))]} hint="اگر یک شناسه ثابت مثل کد محصول یا شماره سفارش انتخاب کنید، ورودهای بعدی همان رکورد را به‌روزرسانی می‌کنند." />
              <section aria-labelledby="sample-heading" className="overflow-hidden rounded-3xl border border-line"><h3 id="sample-heading" className="border-b border-line px-4 py-3 text-sm font-bold">نمونه داده</h3><div className="overflow-x-auto"><table className="min-w-full text-right text-xs"><thead className="bg-surface/45 text-muted"><tr>{preview.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3 font-medium">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-line">{preview.sampleRows.map((row) => <tr key={row.rowNumber}>{preview.columns.map((column) => <td key={column.key} className="max-w-40 truncate px-3 py-3">{row.values[column.key] || "—"}</td>)}</tr>)}</tbody></table></div></section>
              {preview.rejectedRows.length > 0 && <Alert variant="warning" title="نمونه ردیف‌های واردنشده" description={preview.rejectedRows.map((row) => `ردیف ${fa(row.rowNumber)}: ${row.message}`).join(" · ")} />}
            </div>
          )}
          {step === 2 && result && <div className="mx-auto max-w-xl rounded-3xl border border-success/30 bg-success/10 p-6 text-center"><CheckCircle2 className="mx-auto size-9 text-success" aria-hidden /><h3 className="mt-4 text-lg font-bold">ورود داده انجام شد</h3><p className="mt-2 text-sm leading-7 text-muted">{fa(result.insertedCount)} رکورد وارد شد، {fa(result.updatedCount)} رکورد به‌روزرسانی شد و {fa(result.skippedCount)} ردیف تغییری نداشت.</p>{result.failedCount > 0 && <p className="mt-2 text-xs text-warning">{fa(result.failedCount)} ردیف به دلیل اطلاعات نامعتبر وارد نشد.</p>}</div>}
        </div>
        <ModalFooter className="shrink-0 border-t border-line px-5 py-4 sm:px-7">
          {step === 0 && <Button type="button" onClick={() => void loadPreview()} loading={busy} startIcon={<Upload className="size-4" />}>بررسی فایل</Button>}
          {step === 1 && <><Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>انتخاب فایل دیگر</Button><Button type="button" onClick={() => void confirm()} loading={busy} startIcon={<RefreshCw className="size-4" />}>تأیید و ورود</Button></>}
          {step === 2 && <Button type="button" onClick={() => close(false)}>بستن</Button>}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
