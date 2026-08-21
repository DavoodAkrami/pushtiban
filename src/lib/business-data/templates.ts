import type {
  BusinessDataAccessScope,
  BusinessDataAiExposure,
  BusinessDataCollectionKind,
  BusinessDataFieldDefinition,
  BusinessDataFieldRole,
  BusinessDataFieldType,
  BusinessDataFieldValidation,
  BusinessDataTemplate,
} from "./types";

type TemplateFieldInput = {
  key: string;
  label: string;
  type?: BusinessDataFieldType;
  role?: BusinessDataFieldRole;
  description?: string;
  required?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  aiExposure?: BusinessDataAiExposure;
  validation?: BusinessDataFieldValidation;
};

const fields = (
  definitions: readonly TemplateFieldInput[]
): readonly BusinessDataFieldDefinition[] =>
  definitions.map((definition, position) => ({
    key: definition.key,
    label: definition.label,
    type: definition.type ?? "text",
    role: definition.role ?? "custom",
    required: definition.required ?? false,
    searchable:
      definition.searchable ??
      (definition.type === undefined ||
        definition.type === "text" ||
        definition.type === "long_text"),
    filterable: definition.filterable ?? false,
    aiExposure: definition.aiExposure ?? "answer",
    position,
    ...(definition.description
      ? { description: definition.description }
      : {}),
    ...(definition.validation ? { validation: definition.validation } : {}),
  }));

const template = ({
  id,
  label,
  description,
  kind,
  definitions,
  accessScope = "public_catalog",
  aiEnabled = accessScope === "public_catalog",
}: {
  id: string;
  label: string;
  description: string;
  kind: BusinessDataCollectionKind;
  definitions: readonly TemplateFieldInput[];
  accessScope?: BusinessDataAccessScope;
  aiEnabled?: boolean;
}): BusinessDataTemplate => ({
  id,
  label,
  description,
  kind,
  accessScope,
  aiEnabled,
  fields: fields(definitions),
});

const statusField = (
  options: string[],
  aiExposure: BusinessDataAiExposure = "answer"
): TemplateFieldInput => ({
  key: "status",
  label: "وضعیت",
  type: "select",
  role: "status",
  filterable: true,
  aiExposure,
  validation: { options },
});

const priceField = (): TemplateFieldInput => ({
  key: "price",
  label: "قیمت",
  type: "currency",
  role: "price",
  filterable: true,
  validation: { min: 0, decimalPlaces: 2 },
});

const referenceField = (): TemplateFieldInput => ({
  key: "reference",
  label: "شناسه پیگیری",
  role: "reference",
  required: true,
  searchable: false,
  filterable: true,
  aiExposure: "filter_only",
});

const privateCustomerField = (): TemplateFieldInput => ({
  key: "customer_identifier",
  label: "شناسه مشتری",
  role: "customer_identifier",
  searchable: false,
  filterable: true,
  aiExposure: "hidden",
});

export const BUSINESS_DATA_TEMPLATES: readonly BusinessDataTemplate[] = [
  template({
    id: "products",
    label: "محصولات",
    description: "کالاها، قیمت، موجودی و صفحه محصول",
    kind: "product",
    definitions: [
      { key: "name", label: "نام محصول", role: "title", required: true },
      { key: "sku", label: "کد محصول", role: "sku", filterable: true },
      priceField(),
      {
        key: "available",
        label: "موجود است",
        type: "boolean",
        role: "availability",
        filterable: true,
      },
      { key: "description", label: "توضیحات", type: "long_text", role: "description" },
      { key: "url", label: "لینک محصول", type: "url", role: "url" },
    ],
  }),
  template({
    id: "services",
    label: "خدمات",
    description: "خدمات قابل ارائه، قیمت و وضعیت پذیرش",
    kind: "service",
    definitions: [
      { key: "name", label: "نام خدمت", role: "title", required: true },
      { key: "description", label: "توضیحات", type: "long_text", role: "description" },
      priceField(),
      {
        key: "available",
        label: "قابل ارائه است",
        type: "boolean",
        role: "availability",
        filterable: true,
      },
      { key: "booking_url", label: "لینک رزرو", type: "url", role: "url" },
    ],
  }),
  template({
    id: "menu",
    label: "منو",
    description: "آیتم‌های منو، دسته‌بندی، قیمت و موجودی",
    kind: "menu_item",
    definitions: [
      { key: "name", label: "نام آیتم", role: "title", required: true },
      { key: "category", label: "دسته", role: "category", filterable: true },
      { key: "description", label: "توضیحات", type: "long_text", role: "description" },
      priceField(),
      {
        key: "available",
        label: "موجود است",
        type: "boolean",
        role: "availability",
        filterable: true,
      },
    ],
  }),
  template({
    id: "plans",
    label: "پلن‌ها",
    description: "پلن‌های فروش یا خدمات و شرایط هر پلن",
    kind: "plan",
    definitions: [
      { key: "name", label: "نام پلن", role: "title", required: true },
      { key: "description", label: "توضیحات", type: "long_text", role: "description" },
      priceField(),
      { key: "billing_period", label: "دوره پرداخت", role: "category", filterable: true },
      {
        key: "active",
        label: "فعال است",
        type: "boolean",
        role: "availability",
        filterable: true,
      },
    ],
  }),
  template({
    id: "courses",
    label: "دوره‌ها",
    description: "دوره‌ها، زمان‌بندی، شهریه و ظرفیت",
    kind: "course",
    definitions: [
      { key: "name", label: "نام دوره", role: "title", required: true },
      { key: "description", label: "توضیحات", type: "long_text", role: "description" },
      priceField(),
      { key: "starts_at", label: "زمان شروع", type: "datetime", role: "start_at", filterable: true },
      { key: "capacity", label: "ظرفیت", type: "number", role: "quantity", filterable: true, validation: { min: 0, decimalPlaces: 0 } },
      { key: "url", label: "لینک ثبت‌نام", type: "url", role: "url" },
    ],
  }),
  template({
    id: "orders",
    label: "سفارش‌ها",
    description: "وضعیت سفارش‌های مشتری؛ نیازمند تأیید هویت",
    kind: "order",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "summary", label: "عنوان سفارش", role: "title", required: true },
      statusField(["جدید", "در حال پردازش", "آماده", "ارسال‌شده", "تکمیل‌شده", "لغوشده"]),
      { key: "total", label: "مبلغ کل", type: "currency", role: "price", aiExposure: "answer", validation: { min: 0, decimalPlaces: 2 } },
      { key: "placed_at", label: "زمان ثبت", type: "datetime", role: "start_at" },
      privateCustomerField(),
      { key: "internal_notes", label: "یادداشت داخلی", type: "long_text", role: "internal_notes", searchable: false, aiExposure: "hidden" },
    ],
  }),
  template({
    id: "reservations",
    label: "رزروها",
    description: "رزرو مشتری و زمان مراجعه؛ نیازمند تأیید هویت",
    kind: "reservation",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "title", label: "عنوان رزرو", role: "title", required: true },
      statusField(["در انتظار", "تأییدشده", "انجام‌شده", "لغوشده"]),
      { key: "starts_at", label: "زمان رزرو", type: "datetime", role: "start_at", filterable: true },
      { key: "location", label: "محل", role: "location" },
      privateCustomerField(),
    ],
  }),
  template({
    id: "deliveries",
    label: "ارسال‌ها",
    description: "وضعیت ارسال و کد رهگیری؛ نیازمند تأیید هویت",
    kind: "delivery",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "title", label: "عنوان ارسال", role: "title", required: true },
      statusField(["آماده‌سازی", "تحویل به پیک", "در مسیر", "تحویل‌شده", "ناموفق"]),
      { key: "tracking_code", label: "کد رهگیری", role: "tracking", aiExposure: "answer" },
      { key: "estimated_at", label: "زمان تقریبی تحویل", type: "datetime", role: "end_at" },
      privateCustomerField(),
    ],
  }),
  template({
    id: "returns",
    label: "مرجوعی‌ها",
    description: "درخواست‌های بازگشت کالا؛ نیازمند تأیید هویت",
    kind: "return",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "title", label: "عنوان درخواست", role: "title", required: true },
      statusField(["ثبت‌شده", "در حال بررسی", "پذیرفته‌شده", "ردشده", "بازپرداخت‌شده"]),
      { key: "reason", label: "دلیل", type: "long_text", role: "description" },
      privateCustomerField(),
    ],
  }),
  template({
    id: "discounts",
    label: "تخفیف‌ها",
    description: "کدها و پیشنهادهای تخفیف فعال",
    kind: "discount",
    definitions: [
      { key: "name", label: "عنوان تخفیف", role: "title", required: true },
      { key: "code", label: "کد تخفیف", role: "reference", filterable: true },
      { key: "description", label: "شرایط", type: "long_text", role: "description" },
      { key: "ends_at", label: "پایان اعتبار", type: "datetime", role: "end_at", filterable: true },
      { key: "active", label: "فعال است", type: "boolean", role: "availability", filterable: true },
    ],
  }),
  template({
    id: "branches",
    label: "شعبه‌ها",
    description: "نشانی، ساعت کاری و وضعیت شعبه‌ها",
    kind: "branch",
    definitions: [
      { key: "name", label: "نام شعبه", role: "title", required: true },
      { key: "address", label: "نشانی", type: "long_text", role: "location" },
      { key: "hours", label: "ساعت کاری", type: "long_text", role: "description" },
      { key: "active", label: "فعال است", type: "boolean", role: "availability", filterable: true },
      { key: "map_url", label: "لینک نقشه", type: "url", role: "url" },
    ],
  }),
  template({
    id: "enrollments",
    label: "ثبت‌نام‌ها",
    description: "ثبت‌نام فراگیران؛ نیازمند تأیید هویت",
    kind: "enrollment",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "course_name", label: "نام دوره", role: "title", required: true },
      statusField(["در انتظار پرداخت", "فعال", "تکمیل‌شده", "لغوشده"]),
      { key: "starts_at", label: "زمان شروع", type: "datetime", role: "start_at" },
      privateCustomerField(),
    ],
  }),
  template({
    id: "schedules",
    label: "زمان‌بندی",
    description: "نوبت‌ها، کلاس‌ها یا ساعت‌های قابل رزرو",
    kind: "schedule",
    definitions: [
      { key: "title", label: "عنوان", role: "title", required: true },
      { key: "starts_at", label: "شروع", type: "datetime", role: "start_at", filterable: true },
      { key: "ends_at", label: "پایان", type: "datetime", role: "end_at", filterable: true },
      { key: "location", label: "محل", role: "location", filterable: true },
      { key: "available", label: "قابل رزرو است", type: "boolean", role: "availability", filterable: true },
    ],
  }),
  template({
    id: "teachers",
    label: "مدرس‌ها",
    description: "مدرس‌ها، تخصص و راه ارتباطی عمومی",
    kind: "teacher",
    definitions: [
      { key: "name", label: "نام مدرس", role: "title", required: true },
      { key: "expertise", label: "تخصص", role: "category", filterable: true },
      { key: "bio", label: "معرفی", type: "long_text", role: "description" },
      { key: "profile_url", label: "صفحه مدرس", type: "url", role: "url" },
    ],
  }),
  template({
    id: "rooms",
    label: "اتاق‌ها",
    description: "نوع اتاق، ظرفیت، امکانات و قیمت",
    kind: "room",
    definitions: [
      { key: "name", label: "نام اتاق", role: "title", required: true },
      { key: "description", label: "امکانات", type: "long_text", role: "description" },
      priceField(),
      { key: "capacity", label: "ظرفیت", type: "number", role: "quantity", filterable: true, validation: { min: 1, decimalPlaces: 0 } },
      { key: "available", label: "قابل رزرو است", type: "boolean", role: "availability", filterable: true },
    ],
  }),
  template({
    id: "availability",
    label: "ظرفیت و موجودی زمانی",
    description: "ظرفیت قابل فروش در تاریخ یا بازه مشخص",
    kind: "availability",
    definitions: [
      { key: "title", label: "عنوان", role: "title", required: true },
      { key: "date", label: "تاریخ", type: "date", role: "start_at", required: true, filterable: true },
      { key: "quantity", label: "ظرفیت باقی‌مانده", type: "number", role: "quantity", filterable: true, validation: { min: 0, decimalPlaces: 0 } },
      { key: "available", label: "قابل رزرو است", type: "boolean", role: "availability", filterable: true },
    ],
  }),
  template({
    id: "packages",
    label: "پکیج‌ها",
    description: "بسته‌های سفر، اقامت یا خدمات ترکیبی",
    kind: "package",
    definitions: [
      { key: "name", label: "نام پکیج", role: "title", required: true },
      { key: "description", label: "جزئیات", type: "long_text", role: "description" },
      priceField(),
      { key: "starts_at", label: "شروع", type: "datetime", role: "start_at" },
      { key: "available", label: "قابل رزرو است", type: "boolean", role: "availability", filterable: true },
    ],
  }),
  template({
    id: "subscriptions",
    label: "اشتراک‌ها",
    description: "اشتراک مشتری؛ نیازمند تأیید هویت",
    kind: "subscription",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "plan_name", label: "نام پلن", role: "title", required: true },
      statusField(["آزمایشی", "فعال", "متوقف", "لغوشده", "منقضی"]),
      { key: "renews_at", label: "تمدید بعدی", type: "datetime", role: "end_at" },
      privateCustomerField(),
    ],
  }),
  template({
    id: "account_status",
    label: "وضعیت حساب",
    description: "وضعیت حساب مشتری؛ نیازمند تأیید هویت",
    kind: "account_status",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "title", label: "عنوان حساب", role: "title", required: true },
      statusField(["فعال", "محدود", "متوقف", "بسته"]),
      { key: "message", label: "توضیح وضعیت", type: "long_text", role: "description" },
      privateCustomerField(),
    ],
  }),
  template({
    id: "usage_billing",
    label: "مصرف و صورتحساب",
    description: "مصرف یا صورتحساب مشتری؛ نیازمند تأیید هویت",
    kind: "usage_billing",
    accessScope: "verified_customer",
    definitions: [
      referenceField(),
      { key: "title", label: "عنوان دوره", role: "title", required: true },
      { key: "usage", label: "میزان مصرف", type: "number", role: "quantity" },
      { key: "amount_due", label: "مبلغ قابل پرداخت", type: "currency", role: "price", validation: { min: 0, decimalPlaces: 2 } },
      { key: "due_at", label: "سررسید", type: "date", role: "end_at" },
      privateCustomerField(),
    ],
  }),
  template({
    id: "properties",
    label: "ملک‌ها",
    description: "فهرست ملک، نوع معامله، قیمت و وضعیت",
    kind: "property",
    definitions: [
      { key: "title", label: "عنوان ملک", role: "title", required: true },
      { key: "deal_type", label: "نوع معامله", type: "select", role: "category", filterable: true, validation: { options: ["فروش", "رهن", "اجاره"] } },
      priceField(),
      { key: "location", label: "محدوده", role: "location", filterable: true },
      { key: "description", label: "توضیحات", type: "long_text", role: "description" },
      { key: "available", label: "فعال است", type: "boolean", role: "availability", filterable: true },
    ],
  }),
  template({
    id: "custom",
    label: "مجموعه دلخواه",
    description: "یک ساختار ساده برای داده‌ای که قالب آماده ندارد",
    kind: "custom",
    accessScope: "internal",
    aiEnabled: false,
    definitions: [
      { key: "title", label: "عنوان", role: "title", required: true, aiExposure: "hidden" },
      { key: "description", label: "توضیحات", type: "long_text", role: "description", aiExposure: "hidden" },
      statusField(["فعال", "غیرفعال"], "hidden"),
    ],
  }),
] as const;

const CATEGORY_RECOMMENDATIONS: Readonly<Record<string, readonly string[]>> = {
  "online-store": ["products", "orders", "deliveries", "returns", "discounts"],
  fashion: ["products", "orders", "deliveries", "returns", "discounts"],
  food: ["menu", "orders", "reservations", "deliveries", "branches"],
  beauty: ["services", "products", "reservations", "schedules", "branches"],
  health: ["services", "reservations", "schedules", "branches", "products"],
  education: ["courses", "enrollments", "schedules", "teachers", "plans"],
  digital: ["plans", "subscriptions", "account_status", "usage_billing", "services"],
  services: ["services", "schedules", "reservations", "branches", "plans"],
  travel: ["rooms", "reservations", "availability", "services", "packages"],
  home: ["products", "services", "orders", "deliveries", "discounts"],
  "real-estate": ["properties", "services", "reservations", "branches", "plans"],
  other: ["products", "services", "plans", "branches", "custom"],
};

const TEMPLATE_BY_ID = new Map(
  BUSINESS_DATA_TEMPLATES.map((item) => [item.id, item])
);

export const getBusinessDataTemplate = (templateId: string) =>
  TEMPLATE_BY_ID.get(templateId) ?? null;

export const getRecommendedBusinessDataTemplates = (
  businessCategory: string,
  limit = 5
): BusinessDataTemplate[] => {
  const ids = CATEGORY_RECOMMENDATIONS[businessCategory] ?? CATEGORY_RECOMMENDATIONS.other;
  return ids
    .map((id) => TEMPLATE_BY_ID.get(id))
    .filter((item): item is BusinessDataTemplate => Boolean(item))
    .slice(0, Math.max(0, limit));
};

export const getOrderedBusinessDataTemplates = (
  businessCategory: string
): BusinessDataTemplate[] => {
  const recommended = getRecommendedBusinessDataTemplates(
    businessCategory,
    BUSINESS_DATA_TEMPLATES.length
  );
  const recommendedIds = new Set(recommended.map((item) => item.id));
  return [
    ...recommended,
    ...BUSINESS_DATA_TEMPLATES.filter((item) => !recommendedIds.has(item.id)),
  ];
};
