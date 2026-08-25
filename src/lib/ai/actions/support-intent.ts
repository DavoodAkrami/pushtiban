const normalizePersian = (value: string) =>
  value
    .toLowerCase()
    .replace(/‌/g, " ")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\s+/g, " ")
    .trim();

const SUPPORT_REQUEST_PHRASES = [
  "درخواست پشتیبانی",
  "تیکت پشتیبانی",
  "تیکت ثبت",
  "تیکت باز",
  "پیگیری پشتیبانی",
  "پشتیبانی پیگیری",
].map(normalizePersian);

export const isSupportRequestMessage = (message: string) => {
  const normalized = normalizePersian(message);
  return SUPPORT_REQUEST_PHRASES.some((phrase) => normalized.includes(phrase));
};
