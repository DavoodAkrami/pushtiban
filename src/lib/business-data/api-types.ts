import type {
  BusinessDataAccessScope,
  BusinessDataAiExposure,
  BusinessDataCollectionKind,
  BusinessDataCollectionStatus,
  BusinessDataFieldDefinition,
  BusinessDataFieldRole,
  BusinessDataFieldType,
  BusinessDataFieldValidation,
  BusinessDataRecordStatus,
  BusinessDataRecordValues,
  BusinessDataSyncStatus,
  BusinessDataSourceStatus,
  BusinessDataSourceType,
} from "./types";

export type BusinessDataField = BusinessDataFieldDefinition & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessDataSource = {
  id: string;
  name: string;
  type: BusinessDataSourceType;
  status: BusinessDataSourceStatus;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  lastError: string | null;
  configuration: Record<string, unknown>;
  fieldMapping: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
};

export type BusinessDataCollection = {
  id: string;
  key: string;
  name: string;
  description: string;
  kind: BusinessDataCollectionKind;
  accessScope: BusinessDataAccessScope;
  aiEnabled: boolean;
  status: BusinessDataCollectionStatus;
  schemaVersion: number;
  recordCount: number;
  activeRecordCount: number;
  dataUpdatedAt: string | null;
  source: BusinessDataSource | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessDataCollectionDetail = BusinessDataCollection & {
  fields: BusinessDataField[];
  syncRuns: BusinessDataSyncRun[];
  privateAccess: BusinessDataPrivateAccessConfig | null;
};

export type BusinessDataPrivateAccessConfig = {
  enabled: boolean;
  locatorFieldId: string;
  verificationFieldId: string;
  updatedAt: string;
  diagnostics: BusinessDataPrivateAccessDiagnostics;
};

export type BusinessDataPrivateAccessDiagnostics = {
  configurationValid: boolean;
  activeRecordCount: number;
  locatorMissingCount: number;
  verificationMissingCount: number;
  recentReason:
    | "no_candidate"
    | "verifier_mismatch"
    | "config_invalid"
    | "challenge_expired"
    | "rate_limited"
    | "lookup_error"
    | "missing_stored_value"
    | null;
};

export type BusinessDataRecord = {
  id: string;
  values: BusinessDataRecordValues;
  status: BusinessDataRecordStatus;
  sourceId: string | null;
  sourceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessDataRecordPage = {
  records: BusinessDataRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type BusinessDataSyncRun = {
  id: string;
  sourceId: string;
  status: BusinessDataSyncStatus;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type BusinessDataFieldDraft = {
  key: string;
  label: string;
  description?: string;
  type: BusinessDataFieldType;
  role: BusinessDataFieldRole;
  required: boolean;
  searchable: boolean;
  filterable: boolean;
  aiExposure: BusinessDataAiExposure;
  validation?: BusinessDataFieldValidation;
};

export type BusinessDataApiError = {
  error: string;
  code?: string;
};

export const ACCESS_SCOPE_LABELS: Record<BusinessDataAccessScope, string> = {
  public_catalog: "عمومی",
  verified_customer: "فقط مشتری تأییدشده",
  internal: "داخلی",
};

export const AI_EXPOSURE_LABELS: Record<BusinessDataAiExposure, string> = {
  answer: "قابل نمایش در پاسخ",
  filter_only: "فقط برای پیدا کردن رکورد",
  hidden: "پنهان از دستیار",
};

export const FIELD_TYPE_LABELS: Record<BusinessDataFieldType, string> = {
  text: "متن کوتاه",
  long_text: "متن بلند",
  number: "عدد",
  currency: "مبلغ",
  boolean: "بله یا خیر",
  date: "تاریخ",
  datetime: "تاریخ و زمان",
  select: "انتخاب از فهرست",
  url: "لینک",
};

export const COLLECTION_STATUS_LABELS: Record<
  BusinessDataCollectionStatus,
  string
> = {
  draft: "پیش‌نویس",
  active: "فعال",
  paused: "متوقف",
  archived: "بایگانی‌شده",
};

export const RECORD_STATUS_LABELS: Record<BusinessDataRecordStatus, string> = {
  active: "فعال",
  archived: "بایگانی‌شده",
};

export const SOURCE_STATUS_LABELS: Record<BusinessDataSourceStatus, string> = {
  pending: "در انتظار",
  ready: "آماده",
  syncing: "در حال همگام‌سازی",
  paused: "متوقف",
  error: "نیازمند بررسی",
  disconnected: "قطع‌شده",
};

export const SYNC_STATUS_LABELS: Record<BusinessDataSyncStatus, string> = {
  pending: "در انتظار",
  running: "در حال انجام",
  succeeded: "موفق",
  partial: "با چند ردیف واردنشده",
  failed: "ناموفق",
  cancelled: "لغوشده",
};
