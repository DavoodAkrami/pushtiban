import type { SelectOption } from "@/components/ui/select";

// The categories the retrieval layer understands. They must stay in sync with
// the intent classifier in src/lib/ai/rag.ts — a value that never comes back
// from the classifier can never win the same-category ranking boost.
export const CATEGORY_OPTIONS: SelectOption[] = [
  { value: "general", label: "عمومی" },
  { value: "shipping", label: "ارسال و تحویل" },
  { value: "pricing", label: "قیمت و تخفیف" },
  { value: "products", label: "محصولات" },
  { value: "returns", label: "بازگشت و تعویض" },
  { value: "account", label: "حساب کاربری" },
];

export const categoryLabel = (value: string): string =>
  CATEGORY_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
