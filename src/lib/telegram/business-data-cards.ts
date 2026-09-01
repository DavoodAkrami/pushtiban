import type {
  BusinessDataDeliveryField,
  BusinessDataDeliveryRecord,
} from "../business-data/ai-retrieval-core";
import { fa } from "../utils";
import { escapeTelegramHtml } from "./format";

export const TELEGRAM_PHOTO_CAPTION_MAX_LENGTH = 1_024;

const text = (value: string, max: number) =>
  Array.from(value).slice(0, max).join("");

const fieldByRole = (
  record: BusinessDataDeliveryRecord,
  role: BusinessDataDeliveryField["role"]
) => record.fields.find((field) => field.role === role);

const formatValue = (field: BusinessDataDeliveryField) => {
  if (field.value === null || field.value === "") return "—";
  if (field.type === "boolean") return field.value ? "بله" : "خیر";
  if (
    (field.type === "number" || field.type === "currency") &&
    typeof field.value === "number"
  ) {
    const formatted = fa(new Intl.NumberFormat("fa-IR").format(field.value));
    return field.type === "currency" ? `${formatted} تومان` : formatted;
  }
  if (field.type === "date" || field.type === "datetime") {
    const date = new Date(String(field.value));
    return Number.isNaN(date.getTime())
      ? fa(String(field.value))
      : fa(
          new Intl.DateTimeFormat("fa-IR", {
            dateStyle: "medium",
            ...(field.type === "datetime" ? { timeStyle: "short" as const } : {}),
          }).format(date)
        );
  }
  return fa(String(field.value));
};

export const businessDataDeliveryRecordTitle = (
  record: BusinessDataDeliveryRecord
) => {
  const titleField = fieldByRole(record, "title") ?? record.fields[0];
  return titleField?.value === null || titleField?.value === undefined
    ? "مورد پیشنهادی"
    : fa(text(String(titleField.value), 160));
};

export const buildBusinessDataCardCaption = (
  record: BusinessDataDeliveryRecord
) => {
  const titleField = fieldByRole(record, "title") ?? record.fields[0];
  const descriptionField = fieldByRole(record, "description");
  const lines = [
    `<b>${escapeTelegramHtml(businessDataDeliveryRecordTitle(record))}</b>`,
  ];
  if (
    descriptionField &&
    descriptionField.value !== null &&
    descriptionField.value !== ""
  ) {
    const description = escapeTelegramHtml(
      text(String(descriptionField.value), 360)
    );
    if ([...lines, description].join("\n\n").length <= TELEGRAM_PHOTO_CAPTION_MAX_LENGTH) {
      lines.push(description);
    }
  }

  const detailCandidates = record.fields
    .filter(
      (field) =>
        field !== titleField &&
        field !== descriptionField &&
        field.role !== "currency" &&
        field.value !== null &&
        field.value !== ""
    )
    .slice(0, 5)
    .map(
      (field) =>
        `<b>${escapeTelegramHtml(field.label)}:</b> ${escapeTelegramHtml(
          text(formatValue(field), 180)
        )}`
    );
  const details: string[] = [];
  for (const detail of detailCandidates) {
    const nextDetails = [...details, detail];
    if (
      [...lines, nextDetails.join("\n")].join("\n\n").length >
      TELEGRAM_PHOTO_CAPTION_MAX_LENGTH
    ) {
      break;
    }
    details.push(detail);
  }
  if (details.length) lines.push(details.join("\n"));
  return lines.join("\n\n");
};

export const buildProductOrderPrompt = (
  record: BusinessDataDeliveryRecord
) => `می‌خواهم ${businessDataDeliveryRecordTitle(record)} را سفارش دهم.`;
