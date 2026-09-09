/**
 * Convert Persian and Arabic numerals before detecting verification values so
 * the model never receives a phone number or one-time code in either script.
 */
const normalizeNumerals = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

export const redactVerificationInput = (value: string) =>
  normalizeNumerals(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[email]")
    .replace(/(?:\+?98|0098|0)?9(?:[0-9\s()-]*[0-9]){8,14}/g, "[phone]")
    .replace(
      /((?:otp|one[- ]?time|verification|رمز(?:\s*عبور)?|کد\s*(?:تأیید|تایید))\s*[:：-]?\s*)[0-9]{4,8}/giu,
      "$1[code]"
    );
