"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  RefreshCw,
  Sheet,
  Waypoints,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { useDashboardTitle } from "@/components/dashboard/title-context";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { SOURCE_STATUS_LABELS, SYNC_STATUS_LABELS } from "@/lib/business-data/api-types";
import { fa } from "@/lib/utils";
import { useBusinessDataCollection } from "./use-collection";
import { FileImportFlow } from "./file-import-flow";

const formatDate = (value: string | null | undefined) => {
  if (!value) return "هنوز ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "نامشخص";
  return fa(
    new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)
  );
};

export const BusinessDataSourcePanel = ({ collectionId }: { collectionId: string }) => {
  const router = useRouter();
  const { collection, loading, error, reload } = useBusinessDataCollection(collectionId);
  const [fileImportOpen, setFileImportOpen] = React.useState(false);
  useDashboardTitle(collection?.name ?? null);

  if (loading) {
    return (
      <div role="status" aria-label="در حال بارگذاری منبع داده">
        <div className="flex items-start gap-4"><Skeleton className="size-11 rounded-2xl" /><SkeletonText className="flex-1" lines={2} /></div>
        <div className="mt-8 rounded-3xl border border-line bg-surface/30 p-6"><SkeletonText lines={7} /></div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <Alert variant="error" title="منبع داده بارگذاری نشد" description={error}>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" startIcon={<RefreshCw className="size-4" />} onClick={() => void reload()}>تلاش دوباره</Button>
          <Button type="button" size="sm" variant="ghost" startIcon={<ArrowRight className="size-4" />} onClick={() => router.push("/dashboard/data")}>بازگشت</Button>
        </div>
      </Alert>
    );
  }

  const source = collection.source;

  return (
    <>
      <DashboardPageHeader
        title="منبع داده"
        description="این بخش نشان می‌دهد رکوردهای مجموعه از کجا می‌آیند و آخرین وضعیت آن‌ها چیست."
        icon={Waypoints}
      />

      <section aria-labelledby="current-source-heading" className="rounded-3xl border border-line bg-surface/30 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Icon icon={Database} tile size="md" tone="accent" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="current-source-heading" className="text-base font-bold">
                {source?.name ?? "مدیریت دستی"}
              </h2>
              <Badge variant={source?.status === "error" ? "error" : "success"} dot>
                {source ? SOURCE_STATUS_LABELS[source.status] : "آماده"}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-7 text-muted">
              {source?.type === "manual" || !source
                ? "رکوردها از داخل پشتیبان ساخته و ویرایش می‌شوند. برای ورود دسته‌ای می‌توانید یک فایل CSV یا Excel اضافه کنید."
                : "این منبع داده به مجموعه متصل است. ورود دوباره فایل، رکوردهای دارای شناسه یکتا را به‌روزرسانی می‌کند."}
            </p>
          </div>
        </div>

        {source?.lastError && (
          <Alert variant="error" title="منبع نیازمند بررسی است" description={source.lastError} className="mt-5" />
        )}

        <dl className="mt-6 grid gap-5 border-t border-line pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-2 text-xs text-muted"><Database className="size-3.5" aria-hidden /> تعداد رکورد</dt>
            <dd className="mt-2 font-bold">{fa(collection.recordCount)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs text-muted"><Clock3 className="size-3.5" aria-hidden /> آخرین تغییر داده</dt>
            <dd className="mt-2 font-medium">{formatDate(collection.dataUpdatedAt)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="size-3.5" aria-hidden /> آخرین همگام‌سازی</dt>
            <dd className="mt-2 font-medium">{source?.lastSucceededAt ? formatDate(source.lastSucceededAt) : source?.type === "manual" || !source ? "برای منبع دستی کاربرد ندارد" : "هنوز ثبت نشده"}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
          <Button type="button" size="sm" startIcon={<FileSpreadsheet className="size-4" />} onClick={() => setFileImportOpen(true)}>
            ورود از فایل CSV یا Excel
          </Button>
          <Button type="button" size="sm" variant="ghost" startIcon={<Sheet className="size-4" />} disabled title="پس از پیکربندی Google OAuth فعال می‌شود">
            Google Sheets در انتظار پیکربندی
          </Button>
        </div>
      </section>

      {collection.syncRuns.length > 0 && <section aria-labelledby="import-history-heading" className="mt-8 border-t border-line pt-8"><div><h2 id="import-history-heading" className="text-sm font-bold">آخرین ورودها</h2><p className="mt-1 text-xs leading-6 text-muted">نتیجه پنج ورود اخیر این منبع نمایش داده می‌شود.</p></div><ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface/20">{collection.syncRuns.map((run) => <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={run.status === "succeeded" ? "success" : run.status === "partial" ? "warning" : "error"}>{SYNC_STATUS_LABELS[run.status]}</Badge><span className="text-xs text-muted">{formatDate(run.completedAt ?? run.createdAt)}</span></div><p className="mt-2 text-sm">{fa(run.insertedCount)} وارد شد · {fa(run.updatedCount)} به‌روزرسانی شد · {fa(run.skippedCount)} بدون تغییر</p>{run.failedCount > 0 && <p className="mt-1 text-xs text-warning">{fa(run.failedCount)} ردیف وارد نشد</p>}{run.errorSummary && <p className="mt-1 text-xs text-danger">{run.errorSummary}</p>}</div></li>)}</ul></section>}

      <section aria-labelledby="future-sources-heading" className="mt-8 border-t border-line pt-8">
        <h2 id="future-sources-heading" className="text-sm font-bold">راه‌های ورود داده در مرحله‌های بعد</h2>
        <p className="mt-1 text-xs leading-6 text-muted">
          اتصال Google Sheets پس از اتصال امن حساب Google قابل استفاده خواهد بود. اتصال‌های پایگاه‌داده و API در مرحله‌های بعد اضافه می‌شوند.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            { icon: FileSpreadsheet, label: "فایل CSV و Excel", status: "آماده" },
            { icon: Sheet, label: "Google Sheets", status: "در انتظار اتصال" },
            { icon: Waypoints, label: "پایگاه‌داده و API", status: "بعداً" },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/20 p-4 text-sm text-muted">
              <item.icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{item.label}</span>
              <Badge variant={item.status === "آماده" ? "success" : "muted"}>{item.status}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <FileImportFlow collection={collection} open={fileImportOpen} onOpenChange={setFileImportOpen} onImported={() => void reload()} />
    </>
  );
};
