export const businessActionWritesRecords = (actionKey: string) =>
  actionKey === "create_order" || actionKey === "create_reservation";

export const businessActionRequiresCollectionRequiredFieldValidation = (
  actionKey: string
) => businessActionWritesRecords(actionKey);

const normalizeActionMessage = (value: string) =>
  value
    .toLocaleLowerCase("fa-IR")
    .replace(/‌/g, " ")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\s+/g, " ")
    .trim();

const intentMatches = (patterns: RegExp[], message: string) => {
  const normalized = normalizeActionMessage(message);
  return patterns.some((pattern) => pattern.test(normalized));
};

const isLookupIntentMessage = (message: string) =>
  intentMatches(
    [
      /وضعیت/u,
      /پیگیری/u,
      /کجاست/u,
      /بررسی/u,
      /لغو/u,
      /رسید/u,
      /تحویل/u,
      /\b(?:status|track|where|cancel|delivered)\b/iu,
    ],
    message
  );

export const isCreateOrderIntentMessage = (message: string) =>
  !isLookupIntentMessage(message) &&
  intentMatches(
    [
      /سفارش.*(?:بده|ثبت|کن|می ?(?:خوام|خواهم)|میخواهم|جدید)/u,
      /(?:می ?(?:خوام|خواهم)|میخواهم).*(?:بخر|سفارش|خرید)/u,
      /(?:place|make|create).*(?:order|purchase)/u,
      /(?:buy|purchase)\b/u,
    ],
    message
  );

export const isCreateReservationIntentMessage = (message: string) =>
  !isLookupIntentMessage(message) &&
  intentMatches(
    [
      /رزرو.*(?:کن|ثبت|بده|می ?(?:خوام|خواهم)|میخواهم|جدید)/u,
      /(?:می ?(?:خوام|خواهم)|میخواهم).*(?:رزرو|reserve|book)/u,
      /(?:make|create).*(?:reservation|booking|table|seat)/u,
      /(?:book|reserve)\b/u,
      /(?:i|we)\s+want\s+(?:a\s+)?(?:reservation|table|seat)\b/u,
    ],
    message
  );

export const isBusinessMutationIntentMessage = (message: string) =>
  isCreateOrderIntentMessage(message) ||
  isCreateReservationIntentMessage(message);
