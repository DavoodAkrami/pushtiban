import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  insertSupabaseActionRow,
  readSupabaseActionRows,
  updateSupabaseActionRow,
} from "@/lib/business-data/supabase-connector";
import { loadSupabaseSourceCredentials } from "@/lib/business-data/supabase-sync";
import {
  ActionPublicError,
  actionScopeFor,
  defineAction,
  type ActionExecutionContext,
  type ActionSchema,
  type RegisteredActionDefinition,
} from "./core";
import {
  resolveBusinessActionConfiguration,
  type BusinessActionKey,
  type ResolvedBusinessActionConfiguration,
} from "./business-config";

type AvailabilityInput = {
  date: string;
  time: string;
  party_size: number;
};

type AvailabilityResult = {
  determined: boolean;
  available: boolean | null;
  remainingCapacity: number | null;
};

type CreateReservationInput = AvailabilityInput & {
  customer_name: string;
  customer_contact: string;
};

type CreateReservationResult = {
  reference: string;
  status: "created";
};

type CreateOrderInput = {
  product_query: string;
  quantity: number;
  customer_name: string;
  customer_contact: string;
  variant?: string;
};

type PreparedOrderInput = CreateOrderInput & {
  productRecordId: string;
  productReference: string;
  productName: string;
  unitPrice: number;
  totalPrice: number;
  currency: string | null;
};

type CreateOrderResult = {
  reference: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string | null;
  status: "created";
};

type CancelInput = Record<string, never>;

type PreparedCancellation = {
  recordId: string;
  externalId: string;
  reference: string;
  summary: string;
  currentStatus: string | null;
};

type CancelResult = {
  reference: string;
  status: "cancelled";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const validDate = (value: string) => {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasExactKeys = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = []
) => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const boundedText = (value: unknown, max = 160) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max
    ? value.trim()
    : null;

const emptyObjectSchema: ActionSchema<CancelInput> = {
  parse: (value) =>
    isPlainObject(value) && Object.keys(value).length === 0
      ? { success: true, data: {} }
      : { success: false },
};

const availabilityInputSchema: ActionSchema<AvailabilityInput> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, ["date", "time", "party_size"]) ||
      typeof value.date !== "string" ||
      !validDate(value.date) ||
      typeof value.time !== "string" ||
      !TIME_RE.test(value.time) ||
      !Number.isInteger(value.party_size) ||
      Number(value.party_size) < 1 ||
      Number(value.party_size) > 100
    ) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        date: value.date,
        time: value.time,
        party_size: Number(value.party_size),
      },
    };
  },
};

const reservationInputSchema: ActionSchema<CreateReservationInput> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, [
        "date",
        "time",
        "party_size",
        "customer_name",
        "customer_contact",
      ])
    ) {
      return { success: false };
    }
    const availability = availabilityInputSchema.parse({
      date: value.date,
      time: value.time,
      party_size: value.party_size,
    });
    const customerName = boundedText(value.customer_name, 120);
    const customerContact = boundedText(value.customer_contact, 160);
    return availability.success && customerName && customerContact
      ? {
          success: true,
          data: {
            ...availability.data,
            customer_name: customerName,
            customer_contact: customerContact,
          },
        }
      : { success: false };
  },
};

const orderInputSchema: ActionSchema<CreateOrderInput> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(
        value,
        ["product_query", "quantity", "customer_name", "customer_contact"],
        ["variant"]
      ) ||
      !Number.isInteger(value.quantity) ||
      Number(value.quantity) < 1 ||
      Number(value.quantity) > 50
    ) {
      return { success: false };
    }
    const productQuery = boundedText(value.product_query, 160);
    const customerName = boundedText(value.customer_name, 120);
    const customerContact = boundedText(value.customer_contact, 160);
    const variant =
      value.variant === undefined ? undefined : boundedText(value.variant, 120);
    if (!productQuery || !customerName || !customerContact || variant === null) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        product_query: productQuery,
        quantity: Number(value.quantity),
        customer_name: customerName,
        customer_contact: customerContact,
        ...(variant ? { variant } : {}),
      },
    };
  },
};

const preparedOrderSchema: ActionSchema<PreparedOrderInput> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(
        value,
        [
          "product_query",
          "quantity",
          "customer_name",
          "customer_contact",
          "productRecordId",
          "productReference",
          "productName",
          "unitPrice",
          "totalPrice",
          "currency",
        ],
        ["variant"]
      )
    ) {
      return { success: false };
    }
    const base = orderInputSchema.parse(value);
    const productReference = boundedText(value.productReference, 200);
    const productName = boundedText(value.productName, 200);
    const currency =
      value.currency === null ? null : boundedText(value.currency, 40);
    if (
      !base.success ||
      typeof value.productRecordId !== "string" ||
      !UUID_RE.test(value.productRecordId) ||
      !productReference ||
      !productName ||
      typeof value.unitPrice !== "number" ||
      !Number.isFinite(value.unitPrice) ||
      value.unitPrice < 0 ||
      typeof value.totalPrice !== "number" ||
      !Number.isFinite(value.totalPrice) ||
      value.totalPrice !== value.unitPrice * base.data.quantity ||
      (value.currency !== null && !currency)
    ) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        ...base.data,
        productRecordId: value.productRecordId,
        productReference,
        productName,
        unitPrice: value.unitPrice,
        totalPrice: value.totalPrice,
        currency,
      },
    };
  },
};

const preparedCancellationSchema: ActionSchema<PreparedCancellation> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, [
        "recordId",
        "externalId",
        "reference",
        "summary",
        "currentStatus",
      ]) ||
      typeof value.recordId !== "string" ||
      !UUID_RE.test(value.recordId)
    ) {
      return { success: false };
    }
    const externalId = boundedText(value.externalId, 200);
    const reference = boundedText(value.reference, 200);
    const summary = boundedText(value.summary, 500);
    const currentStatus =
      value.currentStatus === null ? null : boundedText(value.currentStatus, 120);
    return externalId && reference && summary && currentStatus !== null
      ? {
          success: true,
          data: {
            recordId: value.recordId,
            externalId,
            reference,
            summary,
            currentStatus,
          },
        }
      : value.currentStatus === null && externalId && reference && summary
        ? {
            success: true,
            data: {
              recordId: value.recordId,
              externalId,
              reference,
              summary,
              currentStatus: null,
            },
          }
        : { success: false };
  },
};

const availabilityResultSchema: ActionSchema<AvailabilityResult> = {
  parse: (value) =>
    isPlainObject(value) &&
    hasExactKeys(value, ["determined", "available", "remainingCapacity"]) &&
    typeof value.determined === "boolean" &&
    (typeof value.available === "boolean" || value.available === null) &&
    (typeof value.remainingCapacity === "number" ||
      value.remainingCapacity === null)
      ? {
          success: true,
          data: value as AvailabilityResult,
        }
      : { success: false },
};

const reservationResultSchema: ActionSchema<CreateReservationResult> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, ["reference", "status"]) ||
      value.status !== "created"
    ) {
      return { success: false };
    }
    const reference = boundedText(value.reference, 200);
    return reference
      ? { success: true, data: { reference, status: "created" } }
      : { success: false };
  },
};

const orderResultSchema: ActionSchema<CreateOrderResult> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, [
        "reference",
        "productName",
        "quantity",
        "unitPrice",
        "totalPrice",
        "currency",
        "status",
      ]) ||
      value.status !== "created"
    ) {
      return { success: false };
    }
    const reference = boundedText(value.reference, 200);
    const productName = boundedText(value.productName, 200);
    const quantity = Number(value.quantity);
    const currency =
      value.currency === null ? null : boundedText(value.currency, 40);
    if (
      !reference ||
      !productName ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      typeof value.unitPrice !== "number" ||
      !Number.isFinite(value.unitPrice) ||
      typeof value.totalPrice !== "number" ||
      !Number.isFinite(value.totalPrice) ||
      (value.currency !== null && !currency)
    ) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        reference,
        productName,
        quantity,
        unitPrice: value.unitPrice,
        totalPrice: value.totalPrice,
        currency,
        status: "created",
      },
    };
  },
};

const cancelResultSchema: ActionSchema<CancelResult> = {
  parse: (value) => {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, ["reference", "status"]) ||
      value.status !== "cancelled"
    ) {
      return { success: false };
    }
    const reference = boundedText(value.reference, 200);
    return reference
      ? { success: true, data: { reference, status: "cancelled" } }
      : { success: false };
  },
};

const normalized = (value: string) =>
  value
    .toLocaleLowerCase("fa-IR")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const intentMatches = (patterns: RegExp[]) => (message: string) =>
  patterns.some((pattern) => pattern.test(normalized(message)));

const checkAvailabilityIntent = intentMatches([
  /(?:جا|ظرفیت|موجود).*(?:دار|هست)/u,
  /(?:available|availability)/u,
]);
const createReservationIntent = intentMatches([
  /(?:رزرو).*(?:کن|ثبت)/u,
  /(?:book|reserve).*(?:table|seat|reservation)?/u,
]);
const cancelReservationIntent = intentMatches([
  /(?:لغو|کنسل).*(?:رزرو)/u,
  /(?:رزرو).*(?:لغو|کنسل)/u,
  /cancel.*reservation/u,
]);
const createOrderIntent = intentMatches([
  /(?:سفارش).*(?:بده|ثبت|کن)/u,
  /(?:می ?خوام|میخواهم).*(?:بخر|سفارش)/u,
  /(?:order|buy).*/u,
]);
const cancelOrderIntent = intentMatches([
  /(?:لغو|کنسل).*(?:سفارش)/u,
  /(?:سفارش).*(?:لغو|کنسل)/u,
  /cancel.*order/u,
]);

const resolveConfiguration = async (
  context: ActionExecutionContext,
  actionKey: BusinessActionKey
) => resolveBusinessActionConfiguration(context.userId, actionKey);

const capabilityEnabled = (actionKey: BusinessActionKey) =>
  async (context: ActionExecutionContext) =>
    Boolean(await resolveConfiguration(context, actionKey));

const usesInternalBusinessData = (
  configuration: ResolvedBusinessActionConfiguration
) => configuration.destination === "internal_business_data";

const externalSourceFor = (
  configuration: ResolvedBusinessActionConfiguration
) => {
  if (!configuration.source) {
    throw new Error("External action source unavailable.");
  }
  return configuration.source;
};

const remoteColumn = (
  configuration: ResolvedBusinessActionConfiguration,
  concept: string
) => {
  const fieldKey = configuration.fieldMapping[concept];
  if (!fieldKey || !configuration.source) return null;
  return (
    Object.entries(configuration.source.fieldMapping).find(
      ([, mappedField]) => mappedField === fieldKey
    )?.[0] ?? null
  );
};

const credentialsFor = async (
  context: ActionExecutionContext,
  configuration: ResolvedBusinessActionConfiguration
) =>
  configuration.source
    ? loadSupabaseSourceCredentials({
        admin: createAdminClient(),
        collectionId: configuration.primary.id,
        sourceId: configuration.source.id,
        userId: context.userId,
      })
    : Promise.reject(new Error("External action source unavailable."));

const internalRpc = async (
  name:
    | "business_data_check_availability_action"
    | "business_data_create_reservation_action"
    | "business_data_create_order_action"
    | "business_data_cancel_action",
  parameters: Record<string, string | number>
) => {
  const { data, error } = await createAdminClient().rpc(name, parameters);
  if (error || !isPlainObject(data)) {
    throw new Error("Internal Business Data action failed.");
  }
  return data;
};

const booleanValue = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value !== "string") return null;
  const candidate = normalized(value);
  if (["true", "yes", "available", "in stock", "موجود", "بله"].includes(candidate)) {
    return true;
  }
  if (["false", "no", "unavailable", "out of stock", "ناموجود", "خیر"].includes(candidate)) {
    return false;
  }
  return null;
};

const liveAvailability = async (
  context: ActionExecutionContext,
  input: AvailabilityInput,
  configuration: ResolvedBusinessActionConfiguration
): Promise<AvailabilityResult> => {
  if (usesInternalBusinessData(configuration)) {
    const result = await internalRpc(
      "business_data_check_availability_action",
      {
        p_user_id: context.userId,
        p_date: input.date,
        p_time: input.time,
        p_party_size: input.party_size,
      }
    );
    return {
      determined: result.determined === true,
      available:
        typeof result.available === "boolean" ? result.available : null,
      remainingCapacity:
        typeof result.remaining_capacity === "number" &&
        Number.isFinite(result.remaining_capacity)
          ? result.remaining_capacity
          : null,
    };
  }
  const source = externalSourceFor(configuration);
  const dateColumn = remoteColumn(configuration, "date");
  const timeColumn = remoteColumn(configuration, "time");
  const availableColumn = remoteColumn(configuration, "available");
  const remainingColumn = remoteColumn(configuration, "remaining_capacity");
  if (!dateColumn || !timeColumn || !availableColumn) {
    return { determined: false, available: null, remainingCapacity: null };
  }
  const credentials = await credentialsFor(context, configuration);
  const rows = await readSupabaseActionRows({
    credentials,
    tableName: source.tableName,
    columns: [availableColumn, ...(remainingColumn ? [remainingColumn] : [])],
    filters: [
      { column: dateColumn, value: input.date },
      { column: timeColumn, value: input.time },
    ],
    limit: 2,
  });
  if (rows.length !== 1) {
    return { determined: false, available: null, remainingCapacity: null };
  }
  const statedAvailable = booleanValue(rows[0][availableColumn]);
  const rawRemaining = remainingColumn ? rows[0][remainingColumn] : null;
  const remainingCapacity =
    typeof rawRemaining === "number" && Number.isFinite(rawRemaining)
      ? Math.max(0, rawRemaining)
      : null;
  if (statedAvailable === null) {
    return { determined: false, available: null, remainingCapacity };
  }
  return {
    determined: true,
    available:
      statedAvailable &&
      (remainingCapacity === null || remainingCapacity >= input.party_size),
    remainingCapacity,
  };
};

const availabilityText = (result: AvailabilityResult) => {
  if (!result.determined) {
    return "ظرفیت این زمان از داده‌های کسب‌وکار قابل تشخیص نیست؛ نمی‌توانم موجود بودن را تأیید کنم.";
  }
  if (!result.available) return "برای این زمان ظرفیت کافی ثبت نشده است.";
  return result.remainingCapacity === null
    ? "برای این زمان ظرفیت موجود است."
    : `برای این زمان ظرفیت موجود است؛ ظرفیت باقی‌مانده ${result.remainingCapacity.toLocaleString("fa-IR")} نفر است.`;
};

const prepareReservation = async (
  context: ActionExecutionContext,
  input: CreateReservationInput
) => {
  const availabilityConfiguration = await resolveBusinessActionConfiguration(
    context.userId,
    "check_availability"
  );
  if (availabilityConfiguration) {
    const availability = await liveAvailability(
      context,
      input,
      availabilityConfiguration
    );
    if (!availability.determined) {
      return {
        success: false as const,
        text: "ظرفیت این زمان از داده‌های کسب‌وکار قابل تشخیص نیست؛ رزرو ثبت نشد.",
      };
    }
    if (!availability.available) {
      return {
        success: false as const,
        text: "برای این زمان ظرفیت کافی ثبت نشده است؛ رزرو ثبت نشد.",
      };
    }
  }
  return { success: true as const, data: input };
};

const existingActionWrite = async (
  context: ActionExecutionContext & { executionId: string },
  configuration: ResolvedBusinessActionConfiguration,
  credentials: Awaited<ReturnType<typeof credentialsFor>>
) => {
  const source = externalSourceFor(configuration);
  const executionColumn = remoteColumn(configuration, "execution_id");
  if (!executionColumn) return null;
  const referenceField = source.externalIdField;
  const referenceColumn = referenceField
    ? Object.entries(source.fieldMapping).find(
        ([, fieldKey]) => fieldKey === referenceField
      )?.[0] ?? null
    : null;
  const rows = await readSupabaseActionRows({
    credentials,
    tableName: source.tableName,
    columns: [executionColumn, ...(referenceColumn ? [referenceColumn] : [])],
    filters: [{ column: executionColumn, value: context.executionId }],
    limit: 1,
  });
  if (!rows.length) return null;
  const reference = referenceColumn
    ? boundedText(String(rows[0][referenceColumn] ?? ""), 200)
    : null;
  return reference ?? context.executionId;
};

const createReservationWrite = async (
  context: ActionExecutionContext & { executionId: string },
  input: CreateReservationInput
): Promise<CreateReservationResult> => {
  const configuration = await resolveConfiguration(context, "create_reservation");
  if (!configuration) throw new Error("Reservation destination unavailable.");
  if (usesInternalBusinessData(configuration)) {
    const result = await internalRpc(
      "business_data_create_reservation_action",
      {
        p_user_id: context.userId,
        p_execution_id: context.executionId,
        p_date: input.date,
        p_time: input.time,
        p_party_size: input.party_size,
        p_customer_name: input.customer_name,
        p_customer_contact: input.customer_contact,
      }
    );
    if (result.status === "unavailable") {
      throw new ActionPublicError(
        "availability_changed",
        "ظرفیت این زمان تغییر کرده است؛ رزرو ثبت نشد. لطفاً زمان دیگری را انتخاب کنید."
      );
    }
    const reference = boundedText(result.reference, 200);
    if (result.status !== "created" || !reference) {
      throw new Error("Internal reservation result was invalid.");
    }
    return { reference, status: "created" };
  }
  const source = externalSourceFor(configuration);
  const credentials = await credentialsFor(context, configuration);
  const existing = await existingActionWrite(context, configuration, credentials);
  if (existing) return { reference: existing, status: "created" };
  const availabilityConfiguration = await resolveBusinessActionConfiguration(
    context.userId,
    "check_availability"
  );
  if (availabilityConfiguration) {
    const availability = await liveAvailability(
      context,
      input,
      availabilityConfiguration
    );
    if (!availability.determined || !availability.available) {
      throw new Error("Reservation availability changed before execution.");
    }
  }
  const concepts: Array<[string, string | number]> = [
    ["date", input.date],
    ["time", input.time],
    ["party_size", input.party_size],
    ["customer_name", input.customer_name],
    ["customer_contact", input.customer_contact],
    ["execution_id", context.executionId],
  ];
  if (remoteColumn(configuration, "status") && configuration.initialStatus) {
    concepts.push(["status", configuration.initialStatus]);
  }
  const values: Record<string, string | number | boolean | null> = {};
  for (const [concept, value] of concepts) {
    const column = remoteColumn(configuration, concept);
    if (!column) throw new Error("Reservation mapping unavailable.");
    values[column] = value;
  }
  const referenceField = source.externalIdField;
  const referenceColumn = referenceField
    ? Object.entries(source.fieldMapping).find(
        ([, fieldKey]) => fieldKey === referenceField
      )?.[0] ?? null
    : null;
  const row = await insertSupabaseActionRow({
    credentials,
    tableName: source.tableName,
    values,
    returningColumns: referenceColumn ? [referenceColumn] : [],
  });
  const reference = referenceColumn
    ? boundedText(String(row[referenceColumn] ?? ""), 200)
    : null;
  return { reference: reference ?? context.executionId, status: "created" };
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const resolveProduct = async (
  context: ActionExecutionContext,
  input: CreateOrderInput,
  configuration: ResolvedBusinessActionConfiguration
) => {
  if (!configuration.related) return null;
  const query = [input.product_query, input.variant].filter(Boolean).join(" ");
  const { data, error } = await createAdminClient()
    .from("business_data_records")
    .select("id, external_id, values")
    .eq("user_id", context.userId)
    .eq("collection_id", configuration.related.id)
    .eq("status", "active")
    .ilike("search_text", `%${escapeLike(query)}%`)
    .limit(5);
  if (error) throw new Error("Product resolution failed.");
  const nameField = configuration.fieldMapping.product_name;
  const referenceField = configuration.fieldMapping.product_reference;
  const priceField = configuration.fieldMapping.product_price;
  const currencyField = configuration.fieldMapping.product_currency;
  const availableField = configuration.fieldMapping.product_available;
  const stockField = configuration.fieldMapping.product_stock;
  const candidates = (data ?? []).map((row) => {
    const values = isPlainObject(row.values) ? row.values : {};
    const name = boundedText(values[nameField], 200);
    const reference =
      boundedText(values[referenceField], 200) ??
      boundedText(row.external_id, 200);
    const price = values[priceField];
    const currency = currencyField
      ? boundedText(values[currencyField], 40)
      : null;
    const available = availableField
      ? booleanValue(values[availableField])
      : null;
    const stock = stockField ? values[stockField] : null;
    const queryKey = normalized(input.product_query);
    const score =
      normalized(String(reference ?? "")) === queryKey
        ? 3
        : normalized(String(name ?? "")) === queryKey
          ? 2
          : normalized(String(name ?? "")).includes(queryKey)
            ? 1
            : 0;
    return {
      id: row.id,
      name,
      reference,
      price,
      currency,
      available,
      stock,
      score,
    };
  }).filter(
    (candidate) =>
      candidate.name &&
      candidate.reference &&
      typeof candidate.price === "number" &&
      Number.isFinite(candidate.price)
  );
  candidates.sort((a, b) => b.score - a.score);
  const product = candidates[0];
  if (!product || (candidates[1] && candidates[1].score === product.score)) {
    return null;
  }
  if (
    product.available === false ||
    (typeof product.stock === "number" && product.stock < input.quantity)
  ) {
    return { unavailable: true as const };
  }
  return {
    unavailable: false as const,
    id: product.id,
    name: product.name!,
    reference: product.reference!,
    price: product.price as number,
    currency: product.currency,
  };
};

const prepareOrder = async (
  context: ActionExecutionContext,
  input: CreateOrderInput
) => {
  const configuration = await resolveConfiguration(context, "create_order");
  if (!configuration) {
    return { success: false as const, text: "ثبت سفارش برای این کسب‌وکار آماده نیست." };
  }
  const product = await resolveProduct(context, input, configuration);
  if (!product) {
    return {
      success: false as const,
      text: "محصول دقیق از داده کسب‌وکار پیدا نشد؛ سفارش ثبت نشد.",
    };
  }
  if (product.unavailable) {
    return {
      success: false as const,
      text: "این محصول با تعداد درخواستی موجود نیست؛ سفارش ثبت نشد.",
    };
  }
  return {
    success: true as const,
    data: {
      ...input,
      productRecordId: product.id,
      productReference: product.reference,
      productName: product.name,
      unitPrice: product.price,
      totalPrice: product.price * input.quantity,
      currency: product.currency,
    },
  };
};

const createOrderWrite = async (
  context: ActionExecutionContext & { executionId: string },
  input: PreparedOrderInput
): Promise<CreateOrderResult> => {
  const configuration = await resolveConfiguration(context, "create_order");
  if (!configuration) throw new Error("Order destination unavailable.");
  if (usesInternalBusinessData(configuration)) {
    const result = await internalRpc("business_data_create_order_action", {
      p_user_id: context.userId,
      p_execution_id: context.executionId,
      p_product_record_id: input.productRecordId,
      p_expected_product_reference: input.productReference,
      p_expected_unit_price: input.unitPrice,
      p_quantity: input.quantity,
      p_customer_name: input.customer_name,
      p_customer_contact: input.customer_contact,
    });
    if (result.status === "price_changed") {
      const currentPrice =
        typeof result.current_price === "number" &&
        Number.isFinite(result.current_price)
          ? result.current_price
          : null;
      const currency = boundedText(result.currency, 40);
      throw new ActionPublicError(
        "price_changed",
        currentPrice === null
          ? "قیمت محصول تغییر کرده است. لطفاً سفارش را دوباره مطرح کنید تا مبلغ جدید را تأیید کنید."
          : `قیمت محصول تغییر کرده و اکنون ${currentPrice.toLocaleString("fa-IR")}${currency ? ` ${currency}` : ""} است. لطفاً سفارش را دوباره مطرح کنید تا مبلغ جدید را تأیید کنید.`
      );
    }
    if (
      result.status === "insufficient_stock" ||
      result.status === "unavailable"
    ) {
      throw new ActionPublicError(
        "insufficient_stock",
        "این محصول با تعداد درخواستی دیگر موجود نیست؛ سفارش ثبت نشد."
      );
    }
    const reference = boundedText(result.reference, 200);
    if (result.status !== "created" || !reference) {
      throw new Error("Internal order result was invalid.");
    }
    return {
      reference,
      productName: input.productName,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      totalPrice: input.totalPrice,
      currency: input.currency,
      status: "created",
    };
  }
  const source = externalSourceFor(configuration);
  const credentials = await credentialsFor(context, configuration);
  const existing = await existingActionWrite(context, configuration, credentials);
  if (existing) {
    return {
      reference: existing,
      productName: input.productName,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      totalPrice: input.totalPrice,
      currency: input.currency,
      status: "created",
    };
  }
  const currentProduct = await resolveProduct(context, input, configuration);
  if (
    !currentProduct ||
    currentProduct.unavailable ||
    currentProduct.id !== input.productRecordId ||
    currentProduct.reference !== input.productReference ||
    currentProduct.price !== input.unitPrice
  ) {
    throw new Error("Product authority changed before order execution.");
  }
  const concepts: Array<[string, string | number]> = [
    ["destination_product_reference", input.productReference],
    ["destination_quantity", input.quantity],
    ["destination_unit_price", input.unitPrice],
    ["destination_customer_name", input.customer_name],
    ["destination_customer_contact", input.customer_contact],
    ["execution_id", context.executionId],
  ];
  if (remoteColumn(configuration, "destination_total_price")) {
    concepts.push(["destination_total_price", input.totalPrice]);
  }
  if (
    remoteColumn(configuration, "destination_status") &&
    configuration.initialStatus
  ) {
    concepts.push(["destination_status", configuration.initialStatus]);
  }
  const values: Record<string, string | number | boolean | null> = {};
  for (const [concept, value] of concepts) {
    const column = remoteColumn(configuration, concept);
    if (!column) throw new Error("Order mapping unavailable.");
    values[column] = value;
  }
  const referenceField = source.externalIdField;
  const referenceColumn = referenceField
    ? Object.entries(source.fieldMapping).find(
        ([, fieldKey]) => fieldKey === referenceField
      )?.[0] ?? null
    : null;
  const row = await insertSupabaseActionRow({
    credentials,
    tableName: source.tableName,
    values,
    returningColumns: referenceColumn ? [referenceColumn] : [],
  });
  const reference = referenceColumn
    ? boundedText(String(row[referenceColumn] ?? ""), 200)
    : null;
  return {
    reference: reference ?? context.executionId,
    productName: input.productName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    totalPrice: input.totalPrice,
    currency: input.currency,
    status: "created",
  };
};

const terminalStatus = (value: string | null) => {
  if (!value) return false;
  const candidate = normalized(value);
  return [
    "cancelled",
    "canceled",
    "completed",
    "delivered",
    "shipped",
    "لغو شده",
    "تکمیل شده",
    "تحویل شده",
    "ارسال شده",
  ].some((status) => candidate.includes(status));
};

const verifiedRecord = async (
  context: ActionExecutionContext,
  configuration: ResolvedBusinessActionConfiguration
) => {
  const scope = actionScopeFor(context);
  const admin = createAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("business_data_verified_customer_sessions")
    .select("record_id")
    .eq("user_id", context.userId)
    .eq("collection_id", configuration.primary.id)
    .eq("channel", context.channel)
    .eq("connection_id", context.connectionId)
    .eq("customer_identity_hash", scope.customerIdentityHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session?.record_id) return null;
  let recordQuery = admin
    .from("business_data_records")
    .select("id, external_id, source_id, values")
    .eq("id", session.record_id)
    .eq("user_id", context.userId)
    .eq("collection_id", configuration.primary.id)
    .eq("status", "active");
  if (configuration.source) {
    recordQuery = recordQuery.eq("source_id", configuration.source.id);
  }
  const { data: record, error: recordError } = await recordQuery.maybeSingle();
  if (recordError || !record || !isPlainObject(record.values)) return null;
  const externalId = boundedText(record.external_id, 200);
  if (!externalId) return null;
  const statusField = configuration.fieldMapping.status;
  const status = statusField
    ? boundedText(record.values[statusField], 120)
    : null;
  const titleField = configuration.primary.fields.find(
    (field) => field.role === "title"
  )?.key;
  const title = titleField
    ? boundedText(record.values[titleField], 160)
    : null;
  return {
    id: record.id,
    externalId,
    status,
    reference: externalId,
    summary: title ? `${title}، شناسه ${externalId}` : `شناسه ${externalId}`,
  };
};

const prepareCancellation = (actionKey: "cancel_reservation" | "cancel_order") =>
  async (context: ActionExecutionContext) => {
    const configuration = await resolveConfiguration(context, actionKey);
    if (!configuration) {
      return { success: false as const, text: "لغو این مورد برای کسب‌وکار آماده نیست." };
    }
    const record = await verifiedRecord(context, configuration);
    if (!record) {
      return {
        success: false as const,
        text: "رکورد تأییدشده و متعلق به شما پیدا نشد؛ لغو انجام نشد.",
      };
    }
    if (terminalStatus(record.status)) {
      return {
        success: false as const,
        text: "وضعیت فعلی این مورد اجازه لغو نمی‌دهد.",
      };
    }
    return {
      success: true as const,
      data: {
        recordId: record.id,
        externalId: record.externalId,
        reference: record.reference,
        summary: record.summary,
        currentStatus: record.status,
      },
    };
  };

const cancelWrite = (actionKey: "cancel_reservation" | "cancel_order") =>
  async (
    context: ActionExecutionContext & { executionId: string },
    input: PreparedCancellation
  ): Promise<CancelResult> => {
    const configuration = await resolveConfiguration(context, actionKey);
    if (!configuration || !configuration.cancellationValue) {
      throw new Error("Cancellation configuration unavailable.");
    }
    const record = await verifiedRecord(context, configuration);
    if (
      !record ||
      record.id !== input.recordId ||
      record.externalId !== input.externalId
    ) {
      throw new Error("Cancellation ownership or status changed.");
    }
    if (
      record.status &&
      normalized(record.status) === normalized(configuration.cancellationValue)
    ) {
      return { reference: input.reference, status: "cancelled" };
    }
    if (terminalStatus(record.status)) {
      throw new Error("Cancellation status no longer permits this operation.");
    }
    if (usesInternalBusinessData(configuration)) {
      const scope = actionScopeFor(context);
      const result = await internalRpc("business_data_cancel_action", {
        p_user_id: context.userId,
        p_execution_id: context.executionId,
        p_action_key: actionKey,
        p_record_id: input.recordId,
        p_channel: context.channel,
        p_connection_id: context.connectionId,
        p_customer_identity_hash: scope.customerIdentityHash,
      });
      const reference = boundedText(result.reference, 200);
      if (result.status !== "cancelled" || !reference) {
        throw new Error("Internal cancellation result was invalid.");
      }
      return { reference, status: "cancelled" };
    }
    const source = externalSourceFor(configuration);
    const statusColumn = remoteColumn(configuration, "status");
    const externalField = source.externalIdField;
    const externalColumn = externalField
      ? Object.entries(source.fieldMapping).find(
          ([, fieldKey]) => fieldKey === externalField
        )?.[0] ?? null
      : null;
    if (!statusColumn || !externalColumn) {
      throw new Error("Cancellation mapping unavailable.");
    }
    const credentials = await credentialsFor(context, configuration);
    await updateSupabaseActionRow({
      credentials,
      tableName: source.tableName,
      match: { column: externalColumn, value: input.externalId },
      values: { [statusColumn]: configuration.cancellationValue },
    });
    return { reference: input.reference, status: "cancelled" };
  };

const formatMoney = (value: number, currency: string | null) =>
  `${value.toLocaleString("fa-IR")}${currency ? ` ${currency}` : ""}`;

const checkAvailability = defineAction<AvailabilityInput, AvailabilityResult>({
  key: "check_availability",
  name: "Check availability",
  description:
    "Check live reservation capacity. Required arguments: date as YYYY-MM-DD, time as HH:MM, and integer party_size. Use only for an availability question; never create a reservation.",
  modelArguments: {
    date: "required YYYY-MM-DD",
    time: "required HH:MM",
    party_size: "required integer 1..100",
  },
  inputSchema: availabilityInputSchema,
  resultSchema: availabilityResultSchema,
  verification: "none",
  confirmation: { required: false },
  settings: {
    displayName: "بررسی ظرفیت رزرو",
    description: "ظرفیت یک تاریخ و ساعت را از داده‌های فعلی کسب‌وکار بررسی می‌کند.",
    defaultEnabled: false,
  },
  intentGuard: checkAvailabilityIntent,
  isEnabled: capabilityEnabled("check_availability"),
  execute: async (context, input) => {
    const configuration = await resolveConfiguration(context, "check_availability");
    return configuration
      ? liveAvailability(context, input, configuration)
      : { determined: false, available: null, remainingCapacity: null };
  },
  formatResult: availabilityText,
});

const createReservation = defineAction<
  CreateReservationInput,
  CreateReservationResult
>({
  key: "create_reservation",
  name: "Create reservation",
  description:
    "Create one reservation only when the customer directly asks. Required arguments: date YYYY-MM-DD, time HH:MM, party_size, customer_name, and customer_contact. If any value is missing, keep action null and ask only for the missing information.",
  modelArguments: {
    date: "required YYYY-MM-DD",
    time: "required HH:MM",
    party_size: "required integer 1..100",
    customer_name: "required string",
    customer_contact: "required string",
  },
  inputSchema: reservationInputSchema,
  resultSchema: reservationResultSchema,
  verification: "none",
  confirmation: {
    required: true,
    prompt: (value) => {
      const input = value as CreateReservationInput;
      return `رزرو برای ${input.party_size.toLocaleString("fa-IR")} نفر در تاریخ ${input.date} ساعت ${input.time} به نام ${input.customer_name} ثبت شود؟`;
    },
  },
  settings: {
    displayName: "ایجاد رزرو",
    description: "پس از بررسی اطلاعات و تأیید مشتری، رزرو را در محل انتخاب‌شده ثبت می‌کند.",
    defaultEnabled: false,
  },
  intentGuard: createReservationIntent,
  isEnabled: capabilityEnabled("create_reservation"),
  prepare: prepareReservation,
  execute: createReservationWrite,
  formatResult: (result) =>
    `رزرو با موفقیت ثبت شد. شناسه رزرو: ${result.reference}`,
});

const cancelReservation = defineAction<
  CancelInput,
  CancelResult,
  PreparedCancellation
>({
  key: "cancel_reservation",
  name: "Cancel reservation",
  description:
    "Cancel the exact reservation bound to the active verified-customer session. Arguments must be empty; never accept a record ID or customer identity from the model.",
  modelArguments: {},
  inputSchema: emptyObjectSchema,
  preparedInputSchema: preparedCancellationSchema,
  resultSchema: cancelResultSchema,
  verification: "verified_customer",
  confirmation: {
    required: true,
    prompt: (value) =>
      `رزرو ${String((value as PreparedCancellation).summary)} لغو شود؟`,
  },
  settings: {
    displayName: "لغو رزرو",
    description: "فقط رزرو دقیق مشتری تأییدشده را پس از تأیید نهایی لغو می‌کند.",
    defaultEnabled: false,
  },
  intentGuard: cancelReservationIntent,
  isEnabled: capabilityEnabled("cancel_reservation"),
  prepare: prepareCancellation("cancel_reservation"),
  execute: cancelWrite("cancel_reservation"),
  formatResult: (result) =>
    `رزرو با شناسه ${result.reference} لغو شد.`,
});

const createOrder = defineAction<CreateOrderInput, CreateOrderResult, PreparedOrderInput>({
  key: "create_order",
  name: "Create order",
  description:
    "Create an order only after server-side product resolution. Required arguments: product_query, quantity, customer_name, customer_contact; variant is optional. Never include product ID, price, stock, table, columns, or URLs.",
  modelArguments: {
    product_query: "required customer product description",
    quantity: "required integer 1..50",
    customer_name: "required string",
    customer_contact: "required string",
    variant: "optional size/color/variant string",
  },
  inputSchema: orderInputSchema,
  preparedInputSchema: preparedOrderSchema,
  resultSchema: orderResultSchema,
  verification: "none",
  confirmation: {
    required: true,
    prompt: (value) => {
      const input = value as PreparedOrderInput;
      return `سفارش ${input.quantity.toLocaleString("fa-IR")} عدد ${input.productName} با مبلغ نهایی ${formatMoney(input.totalPrice, input.currency)} ثبت شود؟`;
    },
  },
  settings: {
    displayName: "ایجاد سفارش",
    description: "محصول و قیمت فعلی را از داده کسب‌وکار حل می‌کند و سفارش را پس از تأیید ثبت می‌کند.",
    defaultEnabled: false,
  },
  intentGuard: createOrderIntent,
  isEnabled: capabilityEnabled("create_order"),
  prepare: prepareOrder,
  execute: createOrderWrite,
  formatResult: (result) =>
    `سفارش ${result.productName} ثبت شد. مبلغ نهایی ${formatMoney(result.totalPrice, result.currency)} و شناسه سفارش ${result.reference} است.`,
});

const cancelOrder = defineAction<CancelInput, CancelResult, PreparedCancellation>({
  key: "cancel_order",
  name: "Cancel order",
  description:
    "Cancel the exact order bound to the active verified-customer session when its authoritative status permits cancellation. Arguments must be empty; never accept an order ID or identity claim from the model.",
  modelArguments: {},
  inputSchema: emptyObjectSchema,
  preparedInputSchema: preparedCancellationSchema,
  resultSchema: cancelResultSchema,
  verification: "verified_customer",
  confirmation: {
    required: true,
    prompt: (value) =>
      `سفارش ${String((value as PreparedCancellation).summary)} لغو شود؟`,
  },
  settings: {
    displayName: "لغو سفارش",
    description: "فقط سفارش دقیق مشتری تأییدشده را در صورت مجاز بودن وضعیت لغو می‌کند.",
    defaultEnabled: false,
  },
  intentGuard: cancelOrderIntent,
  isEnabled: capabilityEnabled("cancel_order"),
  prepare: prepareCancellation("cancel_order"),
  execute: cancelWrite("cancel_order"),
  formatResult: (result) =>
    `سفارش با شناسه ${result.reference} لغو شد.`,
});

export const BUSINESS_ACTION_DEFINITIONS: RegisteredActionDefinition[] = [
  checkAvailability,
  createReservation,
  cancelReservation,
  createOrder,
  cancelOrder,
];
