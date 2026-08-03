// Persian copy for the outcomes of the Instagram connection flow. Shared by
// the onboarding screen, the settings modal and the dashboard page so the same
// failure never gets two different explanations.
//
// Every message names what went wrong and what to do about it — the OAuth
// round trip drops the owner back on a page with no other context.

export type InstagramOutcomeMessage = {
  title: string;
  description: string;
};

const ERROR_MESSAGES: Record<string, InstagramOutcomeMessage> = {
  not_configured: {
    title: "اتصال اینستاگرام هنوز روی سرور آماده نیست",
    description: "این مورد از سمت پشتیبان تنظیم می‌شود؛ کمی بعد دوباره تلاش کنید.",
  },
  invalid_state: {
    title: "این درخواست معتبر نبود",
    description: "صفحه را تازه کنید و اتصال را از ابتدا شروع کنید.",
  },
  denied: {
    title: "اینستاگرام اجازه دسترسی نداد",
    description: "دوباره تلاش کنید و در صفحهٔ اینستاگرام همهٔ دسترسی‌ها را تأیید کنید.",
  },
  exchange_failed: {
    title: "اینستاگرام اتصال را کامل نکرد",
    description: "چند لحظه بعد دوباره تلاش کنید.",
  },
  profile_failed: {
    title: "اطلاعات حساب اینستاگرام خوانده نشد",
    description:
      "مطمئن شوید حسابتان از نوع «تجاری» (Business) است، سپس دوباره تلاش کنید.",
  },
  not_business: {
    title: "این حساب تجاری نیست",
    description:
      "در اپ اینستاگرام حسابتان را به حساب حرفه‌ای از نوع «تجاری» تغییر دهید و دوباره وصل کنید.",
  },
  taken: {
    title: "این حساب اینستاگرام قبلاً وصل شده است",
    description: "هر حساب اینستاگرام فقط به یک کسب‌وکار در پشتیبان وصل می‌شود.",
  },
  save_failed: {
    title: "حساب تأیید شد، اما ذخیره اتصال انجام نشد",
    description: "دوباره تلاش کنید.",
  },
  network: {
    title: "ارتباط با اینستاگرام برقرار نشد",
    description: "اینترنت را بررسی کنید و دوباره تلاش کنید.",
  },
};

const FALLBACK_ERROR: InstagramOutcomeMessage = {
  title: "اتصال اینستاگرام انجام نشد",
  description: "دوباره تلاش کنید.",
};

export const instagramErrorMessage = (reason: string | null) =>
  (reason && ERROR_MESSAGES[reason]) || FALLBACK_ERROR;

export const INSTAGRAM_CONNECTED_MESSAGE: InstagramOutcomeMessage = {
  title: "اینستاگرام وصل شد",
  description: "حساب اینستاگرام شما به پشتیبان متصل است.",
};
