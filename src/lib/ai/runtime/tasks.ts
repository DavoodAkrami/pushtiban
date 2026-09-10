import { randomUUID } from "node:crypto";
import type { TaskDraft } from "./contracts";
import { activeDraft } from "./context";
export const TASK_TTL_MS = 30 * 60_000;
export const normalizeField = (value: unknown) =>
  String(value)
    .toLowerCase()
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const isTaskCancellation = (text: string) =>
  /^(لغو|انصراف|لغو سفارش|لغو درخواست|cancel|cancel order)$/u.test(
    normalizeField(text),
  );
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** Accept only listed fields grounded in this turn; old fields were grounded on collection. */
export const mergeTask = ({
  previous,
  type,
  patch,
  message,
  required,
  allowedSlots,
  now = Date.now(),
}: {
  previous: TaskDraft | null;
  type: TaskDraft["type"];
  patch: unknown;
  message: string;
  required: string[];
  allowedSlots: string[];
  now?: number;
}): TaskDraft => {
  const old = activeDraft(previous, now);
  if (old && old.type !== type)
    throw new Error("task_switch_requires_cancellation");
  const input = object(patch);
  const fields = { ...(old?.fields ?? {}) };
  const customer = { ...object(fields.customer_values) };
  // Strip labeled verification codes even if an untrusted planner proposes one.
  const withoutCodes = message.replace(
    /((?:otp|one[- ]?time|verification|رمز|کد\s*(?:تأیید|تایید))\s*[:：-]?\s*)[0-9۰-۹٠-٩]{4,8}/giu,
    "$1[redacted]",
  );
  const normalized = normalizeField(withoutCodes);
  const numberWords = [
    "صفر",
    "یک",
    "دو",
    "سه",
    "چهار",
    "پنج",
    "شش",
    "هفت",
    "هشت",
    "نه",
    "ده",
  ];
  // Contact values are mapped server-side from the current turn only. The
  // planner sees placeholders, and verification codes are never unmasked.
  const contactValue = (value: unknown) => {
    const raw = withoutCodes
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const matches =
      value === "[email]"
        ? raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu)
        : value === "[phone]"
          ? raw.match(/(?:\+?98|0098|0)?9(?:[0-9\s()-]*[0-9]){8,14}/g)
          : null;
    return matches?.length === 1 ? matches[0] : value;
  };
  const supplied = (v: unknown) =>
    ["string", "number", "boolean"].includes(typeof v) &&
    String(v).length <= 400 &&
    normalizeField(v).length > 0 &&
    (normalized.includes(normalizeField(v)) ||
      (v === true && /^(بله|آره|اره|yes)$/u.test(normalized)) ||
      (v === false && /^(نه|خیر|no)$/u.test(normalized)));
  const keys =
    type === "create_order"
      ? ["product_query", "quantity", "variant"]
      : ["date", "time", "party_size"];
  for (const key of keys) {
    if (input[key] === fields[key]) continue;
    const quantityWord =
      (key === "quantity" || key === "party_size") &&
      typeof input[key] === "number" &&
      numberWords[Number(input[key])] &&
      normalized.split(" ").includes(numberWords[Number(input[key])]);
    if (supplied(input[key]) || quantityWord) fields[key] = input[key];
  }
  for (const [slot, candidate] of Object.entries(
    object(input.customer_values),
  )) {
    const value = contactValue(candidate);
    if (allowedSlots.includes(slot) && supplied(value)) customer[slot] = value;
  }
  // Removed/reconfigured slots cannot retain meaning from a previous schema.
  for (const slot of Object.keys(customer))
    if (!allowedSlots.includes(slot)) delete customer[slot];
  fields.customer_values = customer;
  if (JSON.stringify(fields).length > 1_600)
    throw new Error("task_fields_too_large");
  const missingFields = required.filter((key) =>
    key.startsWith("field_") ? customer[key] === undefined : !fields[key],
  );
  const timestamp = new Date(now).toISOString();
  return {
    id: old?.id ?? randomUUID(),
    type,
    revision: (old?.revision ?? 0) + 1,
    phase: "collecting",
    fields,
    missingFields,
    resourceReferences:
      typeof fields.product_query === "string"
        ? { productQuery: fields.product_query }
        : {},
    confirmation: { required: true, executionId: null },
    verification: { required: false, sessionReference: null },
    createdAt: old?.createdAt ?? timestamp,
    updatedAt: timestamp,
    expiresAt: old?.expiresAt ?? new Date(now + TASK_TTL_MS).toISOString(),
  };
};
export const endTask = (
  draft: TaskDraft,
  phase: "cancelled" | "expired" | "completed",
): TaskDraft => ({
  ...draft,
  phase,
  fields: {},
  missingFields: [],
  resourceReferences: {},
  confirmation: { required: true, executionId: null },
  revision: draft.revision + 1,
  updatedAt: new Date().toISOString(),
});
