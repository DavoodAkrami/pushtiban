import "server-only";

import { Workbook, type Worksheet } from "@excel.js/exceljs";
import { BUSINESS_DATA_LIMITS } from "./limits";
import type {
  BusinessDataFieldDefinition,
  BusinessDataFieldRole,
  BusinessDataFieldType,
  BusinessDataRecordValues,
} from "./types";
import {
  normalizeExternalId,
  normalizeFieldKey,
  validateRecordValues,
} from "./validation";

export type IngestionSourceType = "csv" | "excel" | "google_sheets";

export type NormalizedSourceRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type DetectedColumn = {
  key: string;
  label: string;
  type: BusinessDataFieldType;
  role: BusinessDataFieldRole;
  confidence: "high" | "medium" | "low";
  uniqueCandidate: boolean;
};

export type IngestionMapping = Record<string, string | null>;

export type IngestionPreview = {
  sourceType: IngestionSourceType;
  sourceName: string;
  sheetName: string | null;
  sheetNames: string[];
  columns: DetectedColumn[];
  rows: NormalizedSourceRow[];
  sampleRows: NormalizedSourceRow[];
  warnings: string[];
};

export type ImportPreviewResult = IngestionPreview & {
  validCount: number;
  rejectedCount: number;
  rejectedRows: Array<{ rowNumber: number; message: string }>;
  hasStableIdentifier: boolean;
};

export class BusinessDataIngestionError extends Error {
  code: string;

  constructor(message: string, code = "ingestion_failed") {
    super(message);
    this.name = "BusinessDataIngestionError";
    this.code = code;
  }
}

const blockedKeys = new Set(["__proto__", "prototype", "constructor"]);
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

const normalizeHeader = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\u200c\u200d\ufeff]/g, "")
    .trim()
    .toLocaleLowerCase("fa-IR")
    .replace(/[\s_\-/()\[\].]+/g, "");

const normalizeCell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const candidate = value as { text?: unknown; result?: unknown; formula?: unknown };
    if (candidate.result !== undefined) return normalizeCell(candidate.result);
    if (typeof candidate.text === "string") return candidate.text.normalize("NFKC").trim();
    if (candidate.formula !== undefined) return "";
    return "";
  }
  return String(value).normalize("NFKC").trim();
};

const serializedBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const safeHeaderKey = (header: string, index: number) => {
  const proposed = normalizeFieldKey(header);
  if (!proposed || blockedKeys.has(proposed)) return `field_${index + 1}`;
  return proposed;
};

const aliases: Array<{
  role: BusinessDataFieldRole;
  aliases: string[];
  type?: BusinessDataFieldType;
}> = [
  { role: "title", aliases: ["name", "title", "product name", "service name", "نام", "نام محصول", "نام کالا", "عنوان", "عنوان محصول"] },
  { role: "description", aliases: ["description", "details", "summary", "توضیحات", "شرح", "جزئیات"] , type: "long_text" },
  { role: "price", aliases: ["price", "cost", "amount", "sale price", "قیمت", "مبلغ", "هزینه", "قیمت فروش"], type: "currency" },
  { role: "sku", aliases: ["sku", "product id", "product code", "barcode", "بارکد", "کد محصول", "شناسه محصول", "کد کالا"] },
  { role: "quantity", aliases: ["stock", "stock qty", "quantity", "qty", "inventory", "موجودی", "تعداد", "تعداد موجودی"], type: "number" },
  { role: "availability", aliases: ["available", "availability", "in stock", "موجود", "موجود است", "قابل ارائه"], type: "boolean" },
  { role: "category", aliases: ["category", "group", "type", "دسته", "دسته بندی", "نوع"] },
  { role: "reference", aliases: ["order id", "order number", "reservation id", "reference", "شماره سفارش", "کد سفارش", "شماره رزرو", "شناسه" ] },
  { role: "tracking", aliases: ["tracking", "tracking code", "کد رهگیری", "رهگیری"] },
  { role: "url", aliases: ["url", "link", "product url", "لینک", "آدرس", "لینک محصول"], type: "url" },
  { role: "status", aliases: ["status", "state", "وضعیت"] },
  { role: "start_at", aliases: ["date", "start date", "created at", "تاریخ", "تاریخ شروع", "زمان ثبت"], type: "date" },
  { role: "customer_identifier", aliases: ["customer id", "customer phone", "customer email", "شناسه مشتری", "شماره مشتری", "ایمیل مشتری" ] },
  { role: "location", aliases: ["location", "address", "branch", "مکان", "آدرس", "شعبه"] },
];

const asEnglishDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[٬,]/g, "")
    .trim();

const inferType = (values: string[]): BusinessDataFieldType => {
  const filled = values.filter(Boolean);
  if (!filled.length) return "text";
  const booleanValues = new Set(["true", "false", "yes", "no", "1", "0", "بله", "خیر", "دارد", "ندارد"]);
  if (filled.every((value) => booleanValues.has(value.toLocaleLowerCase("fa-IR")))) return "boolean";
  if (filled.every((value) => /^https?:\/\//i.test(value))) return "url";
  if (filled.every((value) => Number.isFinite(Number(asEnglishDigits(value))))) return "number";
  if (filled.every((value) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))) {
    return filled.some((value) => value.includes("T")) ? "datetime" : "date";
  }
  return filled.some((value) => value.length > 180) ? "long_text" : "text";
};

const detectColumn = (key: string, label: string, values: string[]): DetectedColumn => {
  const normalized = normalizeHeader(label);
  const exact = aliases.find((entry) => entry.aliases.some((alias) => normalizeHeader(alias) === normalized));
  const partial = exact ?? aliases.find((entry) => entry.aliases.some((alias) => normalized.includes(normalizeHeader(alias)) || normalizeHeader(alias).includes(normalized)));
  const nonBlank = values.filter(Boolean);
  const distinct = new Set(nonBlank.map((value) => normalizeExternalId(value))).size;
  const role = partial?.role ?? "custom";
  const type = partial?.type ?? inferType(values);
  const uniqueCandidate =
    nonBlank.length > 0 &&
    distinct === nonBlank.length &&
    (role === "sku" || role === "reference" || role === "tracking" || /(^| )(id|شناسه|کد)( |$)/.test(normalized));
  return {
    key,
    label,
    type,
    role,
    confidence: exact ? "high" : partial ? "medium" : "low",
    uniqueCandidate,
  };
};

const assertBounds = (rows: unknown[][], sourceName: string) => {
  if (!rows.length) throw new BusinessDataIngestionError("این فایل داده‌ای برای خواندن ندارد.", "empty_source");
  if (rows.length - 1 > BUSINESS_DATA_LIMITS.importRows) {
    throw new BusinessDataIngestionError("تعداد ردیف‌های فایل از سقف مجاز بیشتر است.", "row_limit");
  }
  const header = rows[0] ?? [];
  if (!header.length || header.length > BUSINESS_DATA_LIMITS.importColumns) {
    throw new BusinessDataIngestionError("تعداد ستون‌های فایل قابل استفاده نیست.", "column_limit");
  }
  const labels = header.map((value) => normalizeCell(value));
  if (labels.some((label) => !label)) {
    throw new BusinessDataIngestionError("نام همه ستون‌های فایل باید مشخص باشد.", "blank_header");
  }
  const normalizedLabels = labels.map(normalizeHeader);
  if (new Set(normalizedLabels).size !== normalizedLabels.length) {
    throw new BusinessDataIngestionError("نام ستون‌های فایل تکراری است؛ ابتدا آن‌ها را اصلاح کنید.", "duplicate_header");
  }
  const keys = labels.map(safeHeaderKey);
  if (new Set(keys).size !== keys.length) {
    throw new BusinessDataIngestionError("ستون‌های فایل نام‌های قابل تشخیص ندارند.", "unsafe_header");
  }
  for (const row of rows.slice(1)) {
    if (row.length > BUSINESS_DATA_LIMITS.importColumns) {
      throw new BusinessDataIngestionError("یک ردیف فایل ستون‌های بیش از حد دارد.", "column_limit");
    }
    for (const value of row) {
      if (normalizeCell(value).length > BUSINESS_DATA_LIMITS.importCellChars) {
        throw new BusinessDataIngestionError("یکی از مقدارهای فایل بیش از حد طولانی است.", "cell_limit");
      }
    }
  }
  return { labels, keys, sourceName };
};

const makePreview = (rows: unknown[][], sourceType: IngestionSourceType, sourceName: string, sheetName: string | null, sheetNames: string[] = []): IngestionPreview => {
  const { labels, keys } = assertBounds(rows, sourceName);
  const normalizedRows = rows.slice(1).reduce<NormalizedSourceRow[]>((result, row, index) => {
    const values: Record<string, string> = {};
    keys.forEach((key, columnIndex) => {
      values[key] = normalizeCell(row[columnIndex]);
    });
    if (Object.values(values).some(Boolean)) {
      if (serializedBytes(values) > BUSINESS_DATA_LIMITS.importRowBytes) {
        throw new BusinessDataIngestionError("یکی از ردیف‌های فایل بیش از حد بزرگ است.", "row_size");
      }
      result.push({ rowNumber: index + 2, values });
    }
    return result;
  }, []);
  if (!normalizedRows.length) throw new BusinessDataIngestionError("فایل فقط سرستون دارد و ردیفی برای ورود پیدا نشد.", "empty_source");
  const columns = keys.map((key, index) => detectColumn(key, labels[index], normalizedRows.map((row) => row.values[key])));
  return {
    sourceType,
    sourceName,
    sheetName,
    sheetNames,
    columns,
    rows: normalizedRows,
    sampleRows: normalizedRows.slice(0, BUSINESS_DATA_LIMITS.importPreviewRows),
    warnings: columns.some((column) => column.confidence === "low")
      ? ["برخی ستون‌ها نام آشنایی ندارند؛ تطبیق آن‌ها را بررسی کنید."]
      : [],
  };
};

const worksheetRows = (worksheet: Worksheet) => {
  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values);
  });
  return rows;
};

export const parseFileForPreview = async (file: File, selectedSheet?: string | null): Promise<IngestionPreview> => {
  if (file.size <= 0) throw new BusinessDataIngestionError("فایل خالی است.", "empty_file");
  if (file.size > BUSINESS_DATA_LIMITS.importBytes) {
    throw new BusinessDataIngestionError("حجم فایل از سقف مجاز بیشتر است.", "file_limit");
  }
  const name = file.name.normalize("NFKC").trim() || "فایل داده";
  const extension = name.split(".").at(-1)?.toLocaleLowerCase("en-US");
  if (extension !== "csv" && extension !== "xlsx") {
    throw new BusinessDataIngestionError("فقط فایل CSV یا Excel با پسوند XLSX پذیرفته می‌شود.", "unsupported_file");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new Workbook();
  try {
    if (extension === "csv") {
      await workbook.csv.load(buffer);
    } else {
      await workbook.xlsx.load(buffer, { ignoreNodes: ["drawing", "extLst"] });
    }
  } catch {
    throw new BusinessDataIngestionError("فایل قابل خواندن نیست یا ساختار درستی ندارد.", "malformed_file");
  }
  if (workbook.worksheets.length === 0 || workbook.worksheets.length > BUSINESS_DATA_LIMITS.importWorkbookSheets) {
    throw new BusinessDataIngestionError("تعداد برگه‌های فایل قابل استفاده نیست.", "sheet_limit");
  }
  const worksheet = selectedSheet
    ? workbook.worksheets.find((item) => item.name === selectedSheet)
    : workbook.worksheets[0];
  if (!worksheet) throw new BusinessDataIngestionError("برگه انتخاب‌شده در فایل پیدا نشد.", "sheet_not_found");
  return makePreview(
    worksheetRows(worksheet),
    extension === "csv" ? "csv" : "excel",
    name,
    worksheet.name,
    workbook.worksheets.map((item) => item.name)
  );
};

export const parseGoogleRowsForPreview = (input: { spreadsheetName: string; sheetName: string; rows: unknown[][] }) =>
  makePreview(input.rows, "google_sheets", input.spreadsheetName, input.sheetName, [input.sheetName]);

export const suggestedFieldDefinitions = (preview: IngestionPreview): BusinessDataFieldDefinition[] =>
  preview.columns.map((column, position) => ({
    key: column.key,
    label: column.label,
    type: column.type,
    role: column.role,
    required: column.role === "title",
    searchable: !["customer_identifier", "internal_notes"].includes(column.role),
    filterable: ["sku", "reference", "tracking", "category", "status", "availability", "price", "quantity"].includes(column.role),
    aiExposure: ["customer_identifier", "internal_notes"].includes(column.role) ? "hidden" : "answer",
    position,
  }));

export const suggestedMapping = (preview: IngestionPreview, fields: BusinessDataFieldDefinition[]): IngestionMapping => {
  const used = new Set<string>();
  return Object.fromEntries(preview.columns.map((column) => {
    const candidate = fields.find((field) => !used.has(field.key) && (field.key === column.key || field.role === column.role || normalizeHeader(field.label) === normalizeHeader(column.label)));
    if (candidate) used.add(candidate.key);
    return [column.key, candidate?.key ?? null];
  }));
};

const coerceValue = (value: string, type: BusinessDataFieldType) => {
  if (!value) return null;
  if (type === "number" || type === "currency") {
    const numeric = Number(asEnglishDigits(value));
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (type === "boolean") {
    const normalized = value.toLocaleLowerCase("fa-IR");
    if (["true", "yes", "1", "بله", "دارد"].includes(normalized)) return true;
    if (["false", "no", "0", "خیر", "ندارد"].includes(normalized)) return false;
  }
  return value;
};

export const mapAndValidateRows = (
  preview: IngestionPreview,
  mapping: IngestionMapping,
  fields: BusinessDataFieldDefinition[],
  externalIdField: string | null
) => {
  const targetKeys = new Set(fields.map((field) => field.key));
  const mappingValues = Object.values(mapping).filter((value): value is string => typeof value === "string");
  if (new Set(mappingValues).size !== mappingValues.length || mappingValues.some((value) => !targetKeys.has(value))) {
    throw new BusinessDataIngestionError("تطبیق ستون‌ها معتبر نیست.", "invalid_mapping");
  }
  if (externalIdField && !targetKeys.has(externalIdField)) {
    throw new BusinessDataIngestionError("شناسه یکتا معتبر نیست.", "invalid_identifier");
  }
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const valid: Array<{ rowNumber: number; values: BusinessDataRecordValues; externalId: string | null; checksum: string }> = [];
  const rejected: Array<{ rowNumber: number; message: string }> = [];
  for (const row of preview.rows) {
    const values: Record<string, unknown> = {};
    for (const [sourceKey, targetKey] of Object.entries(mapping)) {
      if (!targetKey) continue;
      const field = fieldByKey.get(targetKey);
      if (!field) continue;
      values[targetKey] = coerceValue(row.values[sourceKey] ?? "", field.type);
    }
    const result = validateRecordValues(values, fields);
    if (!result.ok) {
      rejected.push({ rowNumber: row.rowNumber, message: "اطلاعات این ردیف با ساختار مجموعه سازگار نیست." });
      continue;
    }
    const rawExternalId = externalIdField ? result.value[externalIdField] : null;
    const externalId = typeof rawExternalId === "string" && rawExternalId.trim()
      ? normalizeExternalId(rawExternalId).slice(0, BUSINESS_DATA_LIMITS.externalIdChars)
      : null;
    valid.push({
      rowNumber: row.rowNumber,
      values: result.value,
      externalId,
      checksum: Buffer.from(JSON.stringify(result.value)).toString("base64url").slice(0, 128),
    });
  }
  return { valid, rejected: rejected.slice(0, BUSINESS_DATA_LIMITS.importRejectedRows) };
};

export const buildImportPreview = (
  preview: IngestionPreview,
  fields: BusinessDataFieldDefinition[],
  mapping: IngestionMapping,
  externalIdField: string | null
): ImportPreviewResult => {
  const outcome = mapAndValidateRows(preview, mapping, fields, externalIdField);
  return {
    ...preview,
    validCount: outcome.valid.length,
    rejectedCount: preview.rows.length - outcome.valid.length,
    rejectedRows: outcome.rejected,
    hasStableIdentifier: Boolean(externalIdField),
  };
};
