/**
 * Business categories collected during onboarding and stored in
 * profiles.business_category. The slug is the stored value — never change a
 * slug once it ships, only its label. Used to tailor the assistant's tone,
 * starter knowledge, and suggested flows per industry.
 */
export type BusinessCategory = {
  slug: string;
  label: string;
  /** One-line clarification shown under the label in the picker. */
  description: string;
};

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  {
    slug: "online-store",
    label: "فروشگاه اینترنتی",
    description: "فروش کالا از سایت، اینستاگرام یا تلگرام",
  },
  {
    slug: "fashion",
    label: "پوشاک و مد",
    description: "لباس، کیف و کفش، اکسسوری",
  },
  {
    slug: "food",
    label: "رستوران، کافه و مواد غذایی",
    description: "سفارش غذا، شیرینی، قهوه و خوارک",
  },
  {
    slug: "beauty",
    label: "زیبایی و آرایشی",
    description: "سالن زیبایی، لوازم آرایشی و بهداشتی",
  },
  {
    slug: "health",
    label: "پزشکی و سلامت",
    description: "کلینیک، مطب، دارو و مکمل",
  },
  {
    slug: "education",
    label: "آموزش",
    description: "آموزشگاه، دوره آنلاین، مدرس خصوصی",
  },
  {
    slug: "digital",
    label: "خدمات دیجیتال و نرم‌افزار",
    description: "طراحی سایت، اپلیکیشن، مارکتینگ",
  },
  {
    slug: "services",
    label: "خدمات و تعمیرات",
    description: "خدمات در محل، نصب و تعمیر",
  },
  {
    slug: "travel",
    label: "گردشگری و سفر",
    description: "آژانس مسافرتی، تور، اقامتگاه",
  },
  {
    slug: "home",
    label: "خانه و دکوراسیون",
    description: "مبلمان، لوازم خانگی، دکور",
  },
  {
    slug: "real-estate",
    label: "املاک",
    description: "خرید، فروش و اجاره ملک",
  },
  {
    slug: "other",
    label: "دسته‌ای دیگر",
    description: "در فهرست بالا جایی ندارد",
  },
];

export const isBusinessCategory = (value: unknown): boolean =>
  typeof value === "string" &&
  BUSINESS_CATEGORIES.some((category) => category.slug === value);

export const businessCategoryLabel = (slug: string): string =>
  BUSINESS_CATEGORIES.find((category) => category.slug === slug)?.label ?? "";
