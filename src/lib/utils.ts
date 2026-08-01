import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Convert Latin digits in a string to Persian digits. */
export const fa = (input: string | number): string =>
  String(input).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

// Characters that carry no meaning when matching text: the zero-width marks
// (ZWNJ above all — it is everywhere in Persian compounds), tatweel, and the
// Arabic combining diacritics. Written as escapes on purpose: these are
// invisible in an editor, and a stray copy-paste would silently change the set.
const IGNORED_CHARACTERS = /[​-‏ـً-ْٰٔ]/g;

// Letters an Arabic keyboard produces where Persian expects its own form. A
// query typed as «كتاب» has to find a label written «کتاب».
const LETTER_FOLDING: Record<string, string> = {
  "ي": "ی", // ARABIC YEH     -> FARSI YEH
  "ى": "ی", // ALEF MAKSURA   -> FARSI YEH
  "ئ": "ی", // YEH WITH HAMZA -> FARSI YEH
  "ك": "ک", // ARABIC KAF     -> KEHEH
  "ة": "ه", // TEH MARBUTA    -> HEH
  "آ": "ا", // ALEF WITH MADDA      -> ALEF
  "أ": "ا", // ALEF WITH HAMZA ABOVE -> ALEF
  "إ": "ا", // ALEF WITH HAMZA BELOW -> ALEF
  "ؤ": "و", // WAW WITH HAMZA -> WAW
};

const FOLDABLE_LETTERS = /[يىئكةآأإؤ]/g;

/**
 * Fold a string into a stable form for searching: unify the letters that have
 * more than one encoding, drop the marks that only affect shaping, and bring
 * Persian and Arabic-Indic digits back to Latin so «۱۲» and "12" find each
 * other. Comparison only — anything shown to the user goes through fa().
 */
export const normalizeFa = (input: string): string =>
  input
    .replace(IGNORED_CHARACTERS, "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(FOLDABLE_LETTERS, (letter) => LETTER_FOLDING[letter] ?? letter)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
