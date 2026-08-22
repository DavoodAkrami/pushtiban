import { BUSINESS_DATA_LIMITS } from "./limits";
import type {
  BusinessDataAiExposure,
  BusinessDataCollectionKind,
  BusinessDataFieldRole,
  BusinessDataFieldType,
  BusinessDataScalar,
} from "./types";

export const BUSINESS_DATA_FILTER_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
] as const;

export type BusinessDataFilterOperator =
  (typeof BUSINESS_DATA_FILTER_OPERATORS)[number];

export type BusinessDataAiField = {
  key: string;
  label: string;
  type: BusinessDataFieldType;
  role: BusinessDataFieldRole;
  searchable: boolean;
  filterable: boolean;
  aiExposure: BusinessDataAiExposure;
  position: number;
};

export type BusinessDataCapability = {
  key: string;
  name: string;
  description: string;
  kind: BusinessDataCollectionKind;
  schemaVersion: number;
  fields: BusinessDataAiField[];
};

export type BusinessDataLookupFilter = {
  field: string;
  op: BusinessDataFilterOperator;
  value: BusinessDataScalar | [number, number] | [string, string];
};

export type BusinessDataLookupPlan = {
  collection: string;
  query: string | null;
  filters: BusinessDataLookupFilter[];
  sort: { field: string; direction: "asc" | "desc" } | null;
  limit: number;
};

export type BusinessDataLookupRecord = Record<string, BusinessDataScalar>;

export type BusinessDataLookupResult = {
  collectionKey: string;
  collectionName: string;
  collectionKind: BusinessDataCollectionKind;
  matchedCount: number;
  records: BusinessDataLookupRecord[];
  dataUpdatedAt: string | null;
  payloadChars: number;
  truncated: boolean;
  durationMs: number;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const isOperator = (value: unknown): value is BusinessDataFilterOperator =>
  typeof value === "string" &&
  (BUSINESS_DATA_FILTER_OPERATORS as readonly string[]).includes(value);

const operatorsForType = (
  type: BusinessDataFieldType
): readonly BusinessDataFilterOperator[] => {
  if (type === "number" || type === "currency") {
    return ["eq", "neq", "gt", "gte", "lt", "lte", "between"];
  }
  if (type === "date" || type === "datetime") {
    return ["eq", "neq", "gt", "gte", "lt", "lte", "between"];
  }
  if (type === "boolean") return ["eq"];
  if (type === "select") return ["eq", "neq"];
  return ["eq", "neq", "contains"];
};

const boundedString = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() && value.length <= max
    ? value.normalize("NFKC").trim()
    : null;

const normalizeTemporalValue = (
  value: string,
  type: "date" | "datetime"
) => {
  if (type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }
  const datetime = new Date(value);
  return Number.isNaN(datetime.getTime()) ? null : datetime.toISOString();
};

const normalizeFilterValue = (
  value: unknown,
  field: BusinessDataAiField,
  op: BusinessDataFilterOperator
): BusinessDataLookupFilter["value"] | null => {
  if (op === "between") {
    if (!Array.isArray(value) || value.length !== 2) return null;
    if (field.type === "number" || field.type === "currency") {
      if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) {
        return null;
      }
      const start = value[0] as number;
      const end = value[1] as number;
      return start <= end ? [start, end] : null;
    }
    const start = boundedString(value[0], BUSINESS_DATA_LIMITS.aiFilterValueChars);
    const end = boundedString(value[1], BUSINESS_DATA_LIMITS.aiFilterValueChars);
    if (!start || !end) return null;
    const normalizedStart =
      field.type === "date" || field.type === "datetime"
        ? normalizeTemporalValue(start, field.type)
        : start;
    const normalizedEnd =
      field.type === "date" || field.type === "datetime"
        ? normalizeTemporalValue(end, field.type)
        : end;
    return normalizedStart && normalizedEnd && normalizedStart <= normalizedEnd
      ? [normalizedStart, normalizedEnd]
      : null;
  }
  if (field.type === "number" || field.type === "currency") {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  if (field.type === "boolean") return typeof value === "boolean" ? value : null;
  const text = boundedString(value, BUSINESS_DATA_LIMITS.aiFilterValueChars);
  if (!text) return null;
  if (field.type === "date" || field.type === "datetime") {
    return normalizeTemporalValue(text, field.type);
  }
  return text;
};

export const validateBusinessDataLookupPlan = (
  value: unknown,
  capabilities: BusinessDataCapability[]
): BusinessDataLookupPlan | null => {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ["collection", "query", "filters", "sort", "limit"])
  ) {
    return null;
  }
  const collectionKey = boundedString(value.collection, 64);
  const capability = capabilities.find((item) => item.key === collectionKey);
  if (!capability) return null;

  const queryAbsent =
    value.query === null || value.query === undefined || value.query === "";
  const query = queryAbsent
    ? null
    : boundedString(value.query, BUSINESS_DATA_LIMITS.aiLookupQueryChars);
  if (!queryAbsent && !query) return null;
  if (query && !capability.fields.some((field) => field.searchable)) return null;

  const rawFilters = value.filters ?? [];
  if (
    !Array.isArray(rawFilters) ||
    rawFilters.length > BUSINESS_DATA_LIMITS.aiFiltersPerLookup
  ) {
    return null;
  }
  const filters: BusinessDataLookupFilter[] = [];
  for (const rawFilter of rawFilters) {
    if (
      !isObject(rawFilter) ||
      !hasOnlyKeys(rawFilter, ["field", "op", "value"]) ||
      !isOperator(rawFilter.op)
    ) {
      return null;
    }
    const fieldKey = boundedString(rawFilter.field, 64);
    const field = capability.fields.find(
      (item) => item.key === fieldKey && item.filterable && item.aiExposure !== "hidden"
    );
    if (!field || !operatorsForType(field.type).includes(rawFilter.op)) return null;
    const normalizedValue = normalizeFilterValue(rawFilter.value, field, rawFilter.op);
    if (normalizedValue === null) return null;
    filters.push({ field: field.key, op: rawFilter.op, value: normalizedValue });
  }

  let sort: BusinessDataLookupPlan["sort"] = null;
  if (value.sort !== null && value.sort !== undefined) {
    if (
      !isObject(value.sort) ||
      !hasOnlyKeys(value.sort, ["field", "direction"])
    ) {
      return null;
    }
    const fieldKey = boundedString(value.sort.field, 64);
    const field = capability.fields.find(
      (item) => item.key === fieldKey && item.filterable && item.aiExposure !== "hidden"
    );
    if (!field || (value.sort.direction !== "asc" && value.sort.direction !== "desc")) {
      return null;
    }
    sort = { field: field.key, direction: value.sort.direction };
  }

  const limit =
    value.limit === undefined
      ? BUSINESS_DATA_LIMITS.aiDefaultResultRecords
      : value.limit;
  if (
    !Number.isInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > BUSINESS_DATA_LIMITS.aiResultRecords
  ) {
    return null;
  }

  if (!query && filters.length === 0 && !sort) return null;
  return { collection: capability.key, query, filters, sort, limit: limit as number };
};

const ROLE_PRIORITY: BusinessDataFieldRole[] = [
  "title",
  "price",
  "currency",
  "availability",
  "status",
  "category",
  "sku",
  "description",
  "url",
  "quantity",
  "start_at",
  "end_at",
  "location",
  "reference",
  "tracking",
  "custom",
];

const rolePriority = (role: BusinessDataFieldRole) => {
  const priority = ROLE_PRIORITY.indexOf(role);
  return priority < 0 ? ROLE_PRIORITY.length : priority;
};

export const selectBusinessDataProjection = (
  capability: BusinessDataCapability,
  plan: BusinessDataLookupPlan
): BusinessDataAiField[] => {
  const preferred = new Set([
    ...plan.filters.map((filter) => filter.field),
    ...(plan.sort ? [plan.sort.field] : []),
  ]);
  return capability.fields
    .filter((field) => field.aiExposure === "answer")
    .sort((left, right) => {
      const titleDifference =
        Number(right.role === "title") - Number(left.role === "title");
      if (titleDifference) return titleDifference;
      const preferredDifference = Number(preferred.has(right.key)) - Number(preferred.has(left.key));
      if (preferredDifference) return preferredDifference;
      const roleDifference = rolePriority(left.role) - rolePriority(right.role);
      return roleDifference || left.position - right.position;
    })
    .slice(0, BUSINESS_DATA_LIMITS.aiResultFields);
};

const truncateValue = (value: BusinessDataScalar): BusinessDataScalar => {
  if (typeof value !== "string") return value;
  const points = Array.from(value);
  if (points.length <= BUSINESS_DATA_LIMITS.aiResultValueChars) return value;
  return `${points.slice(0, BUSINESS_DATA_LIMITS.aiResultValueChars - 1).join("")}…`;
};

export const minimizeBusinessDataResult = ({
  capability,
  durationMs,
  matchedCount,
  plan,
  rows,
}: {
  capability: BusinessDataCapability;
  durationMs: number;
  matchedCount: number;
  plan: BusinessDataLookupPlan;
  rows: Array<{ values: Record<string, unknown>; dataUpdatedAt: string | null }>;
}): BusinessDataLookupResult => {
  const projection = selectBusinessDataProjection(capability, plan);
  const records: BusinessDataLookupRecord[] = [];
  let dataUpdatedAt: string | null = null;
  let truncated =
    matchedCount > rows.length ||
    capability.fields.filter((field) => field.aiExposure === "answer").length >
      projection.length;

  for (const row of rows.slice(0, plan.limit)) {
    const record: BusinessDataLookupRecord = {};
    for (const field of projection) {
      const value = row.values[field.key];
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        if (value !== undefined) record[field.label] = truncateValue(value);
      }
    }
    const nextRecords = [...records, record];
    const serialized = JSON.stringify({
      collection: capability.name,
      matched: matchedCount,
      records: nextRecords,
    });
    if (serialized.length > BUSINESS_DATA_LIMITS.aiResultChars) {
      truncated = true;
      break;
    }
    records.push(record);
    if (row.dataUpdatedAt && (!dataUpdatedAt || row.dataUpdatedAt > dataUpdatedAt)) {
      dataUpdatedAt = row.dataUpdatedAt;
    }
  }

  const payload = JSON.stringify({
    collection: capability.name,
    matched: matchedCount,
    records,
  });
  return {
    collectionKey: capability.key,
    collectionName: capability.name,
    collectionKind: capability.kind,
    matchedCount,
    records,
    dataUpdatedAt,
    payloadChars: payload.length,
    truncated,
    durationMs,
  };
};

export const buildBusinessDataCapabilitySummary = (
  capabilities: BusinessDataCapability[]
) => {
  const lines: string[] = [];
  let characters = 0;
  for (const capability of capabilities.slice(
    0,
    BUSINESS_DATA_LIMITS.aiCapabilityCollections
  )) {
    const line = JSON.stringify({
      collection: capability.key,
      name: Array.from(capability.name).slice(0, 60).join(""),
      description: Array.from(capability.description).slice(0, 80).join(""),
      kind: capability.kind,
      fields: capability.fields
        .filter((field) => field.searchable || field.filterable)
        .sort((left, right) => rolePriority(left.role) - rolePriority(right.role))
        .slice(0, BUSINESS_DATA_LIMITS.aiCapabilityFieldsPerCollection)
        .map((field) => ({
          key: field.key,
          label: Array.from(field.label).slice(0, 40).join(""),
          role: field.role,
          type: field.type,
          search: field.searchable,
          filter: field.filterable,
        })),
    });
    if (
      characters + line.length > BUSINESS_DATA_LIMITS.aiCapabilitySummaryChars &&
      lines.length > 0
    ) {
      break;
    }
    lines.push(line);
    characters += line.length;
  }
  return lines.join("\n");
};
