import type { Metadata } from "next";
import { AuthClient } from "./auth-client";

export const metadata: Metadata = {
  title: "ورود یا ثبت‌نام — پشتیبان",
  description: "حساب پشتیبان را بسازید و ربات پشتیبانی تلگرام‌تان را راه‌اندازی کنید.",
};

const AuthPage = ({
  searchParams,
}: {
  searchParams: { error?: string };
}) => (
  <AuthClient
    initialError={
      searchParams.error === "confirmation"
        ? "تأیید ایمیل کامل نشد؛ لینک ایمیل را دوباره باز کنید."
        : undefined
    }
  />
);

export default AuthPage;
