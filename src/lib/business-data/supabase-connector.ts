import "server-only";

import { BUSINESS_DATA_LIMITS } from "./limits";

const REQUEST_TIMEOUT_MS = 12_000;
const OPENAPI_MAX_BYTES = 2_000_000;
const TABLE_LIMIT = 30;

type OpenApiProperty = {
  type?: unknown;
  format?: unknown;
};

type OpenApiDocument = {
  paths?: unknown;
  definitions?: unknown;
};

export type SupabaseConnectorCredentials = {
  projectUrl: string;
  apiKey: string;
};

export type SupabaseDiscoveredTable = {
  name: string;
  columns: Array<{ name: string; type: string }>;
  approximateRowCount: number | null;
  suggestedPurpose: string | null;
};

export class SupabaseConnectorError extends Error {
  code: "invalid_input" | "connection_failed" | "table_not_found" | "read_failed" | "payload_too_large";

  constructor(code: SupabaseConnectorError["code"]) {
    super(code);
    this.name = "SupabaseConnectorError";
    this.code = code;
  }
}

export const getSupabaseConnectorPublicError = (error: SupabaseConnectorError) => {
  if (error.code === "invalid_input") {
    return { message: "آدرس پروژه یا کلید اتصال معتبر نیست.", status: 400 };
  }
  if (error.code === "table_not_found") {
    return { message: "جدول انتخاب‌شده پیدا نشد.", status: 404 };
  }
  if (error.code === "payload_too_large") {
    return {
      message: "حجم اطلاعات این جدول از سقف ورود دستی بیشتر است.",
      status: 413,
    };
  }
  return {
    message:
      error.code === "read_failed"
        ? "خواندن جدول ممکن نبود؛ دسترسی Data API را بررسی کنید."
        : "اطلاعات اتصال صحیح نیست یا دسترسی کافی وجود ندارد.",
    status: 400,
  };
};

const purposeByTable: Record<string, string> = {
  products: "محصولات",
  product: "محصولات",
  orders: "سفارش‌ها",
  order: "سفارش‌ها",
  customers: "مشتریان",
  customer: "مشتریان",
  reservations: "رزروها",
  reservation: "رزروها",
  services: "خدمات",
  service: "خدمات",
  inventory: "موجودی",
};

const connectorHeaders = (apiKey: string, accept = "application/json") => ({
  Accept: accept,
  apikey: apiKey,
  ...(!apiKey.startsWith("sb_secret_") ? { Authorization: `Bearer ${apiKey}` } : {}),
});

export const parseSupabaseProjectUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 300) {
    throw new SupabaseConnectorError("invalid_input");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new SupabaseConnectorError("invalid_input");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new SupabaseConnectorError("invalid_input");
  }
  return url.origin;
};

export const parseSupabaseApiKey = (value: unknown) => {
  if (typeof value !== "string") throw new SupabaseConnectorError("invalid_input");
  const key = value.trim();
  const isSecret = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key);
  let isLegacyServiceRole = false;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString("utf8")
      ) as { role?: unknown };
      isLegacyServiceRole = payload.role === "service_role";
    } catch {
      isLegacyServiceRole = false;
    }
  }
  if ((!isSecret && !isLegacyServiceRole) || key.length > 2_000) {
    throw new SupabaseConnectorError("invalid_input");
  }
  return key;
};

const fetchSupabase = async (url: string, apiKey: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { ...connectorHeaders(apiKey), ...init.headers },
      signal: controller.signal,
    });
  } catch {
    throw new SupabaseConnectorError("connection_failed");
  } finally {
    clearTimeout(timeout);
  }
};

const readBoundedJson = async (response: Response, maxBytes: number) => {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SupabaseConnectorError("payload_too_large");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new SupabaseConnectorError("payload_too_large");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SupabaseConnectorError("connection_failed");
  }
};

const discoverDocument = async (credentials: SupabaseConnectorCredentials) => {
  const response = await fetchSupabase(
    `${credentials.projectUrl}/rest/v1/`,
    credentials.apiKey,
    { headers: connectorHeaders(credentials.apiKey, "application/openapi+json") }
  );
  if (!response.ok) throw new SupabaseConnectorError("connection_failed");
  return (await readBoundedJson(response, OPENAPI_MAX_BYTES)) as OpenApiDocument;
};

const tableNamesFromDocument = (document: OpenApiDocument) => {
  if (!document.paths || typeof document.paths !== "object") {
    throw new SupabaseConnectorError("connection_failed");
  }
  return Object.entries(document.paths as Record<string, unknown>)
    .filter(([path, methods]) =>
      path.startsWith("/") &&
      !path.startsWith("/rpc/") &&
      methods !== null &&
      typeof methods === "object" &&
      "get" in methods
    )
    .map(([path]) => decodeURIComponent(path.slice(1)))
    .filter((name) => name && name.length <= 120)
    .slice(0, TABLE_LIMIT);
};

const tableColumns = (document: OpenApiDocument, tableName: string) => {
  if (!document.definitions || typeof document.definitions !== "object") return [];
  const definition = (document.definitions as Record<string, unknown>)[tableName];
  if (!definition || typeof definition !== "object") return [];
  const properties = (definition as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return [];
  return Object.entries(properties as Record<string, OpenApiProperty>)
    .slice(0, BUSINESS_DATA_LIMITS.importColumns)
    .map(([name, property]) => ({
      name,
      type:
        typeof property.format === "string"
          ? property.format
          : typeof property.type === "string"
            ? property.type
            : "unknown",
    }));
};

const plannedCount = async (credentials: SupabaseConnectorCredentials, tableName: string) => {
  try {
    const response = await fetchSupabase(
      `${credentials.projectUrl}/rest/v1/${encodeURIComponent(tableName)}?select=*`,
      credentials.apiKey,
      {
        method: "HEAD",
        headers: {
          ...connectorHeaders(credentials.apiKey),
          Prefer: "count=planned",
          Range: "0-0",
        },
      }
    );
    if (!response.ok) return null;
    const total = response.headers.get("content-range")?.split("/").at(-1);
    if (!total || total === "*") return null;
    const count = Number(total);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
};

export const discoverSupabaseTables = async (credentials: SupabaseConnectorCredentials) => {
  const document = await discoverDocument(credentials);
  const names = tableNamesFromDocument(document);
  const counts = await Promise.all(names.map((name) => plannedCount(credentials, name)));
  return names.map<SupabaseDiscoveredTable>((name, index) => ({
    name,
    columns: tableColumns(document, name),
    approximateRowCount: counts[index],
    suggestedPurpose: purposeByTable[name.toLocaleLowerCase("en-US")] ?? null,
  }));
};

export const readSupabaseTable = async (
  credentials: SupabaseConnectorCredentials,
  tableName: string
) => {
  const document = await discoverDocument(credentials);
  const tableNames = tableNamesFromDocument(document);
  if (!tableNames.includes(tableName)) throw new SupabaseConnectorError("table_not_found");
  const columns = tableColumns(document, tableName).map((column) => column.name);
  const rows: Array<Record<string, unknown>> = [];
  let nextStart = 0;
  for (let page = 0; page < 20 && rows.length < BUSINESS_DATA_LIMITS.importRows; page += 1) {
    const remaining = BUSINESS_DATA_LIMITS.importRows - rows.length;
    const pageSize = Math.min(1_000, remaining);
    const response = await fetchSupabase(
      `${credentials.projectUrl}/rest/v1/${encodeURIComponent(tableName)}?select=*`,
      credentials.apiKey,
      {
        headers: {
          ...connectorHeaders(credentials.apiKey),
          Range: `${nextStart}-${nextStart + pageSize - 1}`,
        },
      }
    );
    if (!response.ok) throw new SupabaseConnectorError("read_failed");
    const data = await readBoundedJson(response, BUSINESS_DATA_LIMITS.importBytes);
    if (!Array.isArray(data) || data.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new SupabaseConnectorError("read_failed");
    }
    const pageRows = data as Array<Record<string, unknown>>;
    rows.push(...pageRows);
    if (pageRows.length === 0) break;
    nextStart += pageRows.length;
    const totalValue = response.headers.get("content-range")?.split("/").at(-1);
    const total = totalValue && totalValue !== "*" ? Number(totalValue) : null;
    if (total !== null && Number.isFinite(total) && nextStart >= total) break;
    if (!response.headers.get("content-range") && pageRows.length < pageSize) break;
  }
  return { rows, columns };
};
