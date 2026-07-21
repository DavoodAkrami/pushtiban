"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { luxe } from "@/components/motion/reveal";
import { createClient } from "@/lib/supabase/client";
import { cn, fa } from "@/lib/utils";

type Mode = "login" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const faAuthError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials"))
    return "ایمیل یا رمز عبور درست نیست.";
  if (normalized.includes("already registered"))
    return "با این ایمیل قبلاً حساب ساخته شده؛ از «ورود» استفاده کنید.";
  if (normalized.includes("rate limit"))
    return "تعداد تلاش‌ها زیاد شد؛ چند دقیقه بعد دوباره امتحان کنید.";
  if (normalized.includes("email not confirmed"))
    return "ایمیل شما هنوز تأیید نشده؛ لینک تأیید را در صندوق ورودی باز کنید.";
  if (normalized.includes("network") || normalized.includes("fetch"))
    return "اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.";
  return "مشکلی پیش آمد؛ دوباره تلاش کنید.";
};

const PasswordInput = (props: React.ComponentProps<typeof Input>) => {
  const [show, setShow] = React.useState(false);

  return (
    <Input
      {...props}
      type={show ? "text" : "password"}
      dir="ltr"
      className="text-start"
      startIcon={<Lock />}
      endIcon={
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? "پنهان کردن رمز" : "نمایش رمز"}
          onClick={() => setShow((value) => !value)}
          className="text-muted transition-colors hover:text-foreground"
        >
          {show ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      }
    />
  );
};

export const AuthClient = ({ initialError }: { initialError?: string }) => {
  const router = useRouter();
  const reduce = useReducedMotion();
  const supabase = React.useMemo(() => createClient(), []);

  const [mode, setMode] = React.useState<Mode>("login");
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(
    initialError ?? null
  );
  const [signedUpEmail, setSignedUpEmail] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setFormError(null);
    setFieldErrors({});
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) {
      errors.email = "یک ایمیل معتبر وارد کنید.";
    }
    if (password.length < 8) {
      errors.password = `رمز عبور باید دست‌کم ${fa(8)} کاراکتر باشد.`;
    }
    if (mode === "signup" && confirm !== password) {
      errors.confirm = "تکرار رمز با رمز عبور یکسان نیست.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setFormError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      setFormError(faAuthError(error.message));
      return;
    }

    router.push("/onboarding");
    router.refresh();
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setLoading(true);
    setFormError(null);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });

    if (error) {
      setLoading(false);
      setFormError(faAuthError(error.message));
      return;
    }

    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }

    setLoading(false);
    setSignedUpEmail(email.trim());
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "login") void handleLogin();
    else void handleSignup();
  };

  const returnToLogin = () => {
    setSignedUpEmail(null);
    setMode("login");
    setPassword("");
    setConfirm("");
    setFieldErrors({});
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden px-4 py-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(40rem_18rem_at_50%_-4rem,rgb(var(--accent)/0.14),transparent_70%)]"
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: luxe }}
        className="relative w-full max-w-md"
      >
        <Link
          href="/"
          className="mx-auto mb-8 flex w-fit items-center gap-2.5 rounded-full font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-glow">
            <Bot className="size-5" aria-hidden />
          </span>
          پشتیبان
        </Link>

        <div className="rounded-3xl border border-line bg-surface/60 p-7 shadow-soft sm:p-9">
          {signedUpEmail ? (
            <div className="space-y-5 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/10 text-success">
                <MailCheck className="size-7" aria-hidden />
              </span>
              <div className="space-y-2">
                <h1 className="text-xl font-bold">ایمیل‌تان را تأیید کنید</h1>
                <p className="text-sm leading-7 text-muted">
                  لینک تأیید را به{" "}
                  <bdi dir="ltr" className="font-medium text-foreground">
                    {signedUpEmail}
                  </bdi>{" "}
                  فرستادیم. بعد از تأیید، مستقیم راه‌اندازی ربات تلگرام را شروع
                  می‌کنید.
                </p>
              </div>
              <Alert
                variant="info"
                title="ایمیل را پیدا نمی‌کنید؟"
                description="پوشه هرزنامه را هم بررسی کنید؛ رسیدن لینک ممکن است چند لحظه طول بکشد."
                className="text-start"
              />
              <Button variant="outline" className="w-full" onClick={returnToLogin}>
                بعد از تأیید وارد می‌شوم
              </Button>
            </div>
          ) : (
            <>
              <div
                className="mb-7 grid grid-cols-2 rounded-full border border-line bg-background/60 p-1"
                role="tablist"
                aria-label="ورود یا ثبت‌نام"
              >
                {(["login", "signup"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={mode === item}
                    onClick={() => switchMode(item)}
                    className={cn(
                      "relative rounded-full py-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                      mode === item
                        ? "text-foreground"
                        : "text-muted hover:text-foreground"
                    )}
                  >
                    {mode === item && (
                      <motion.span
                        layoutId="auth-mode-pill"
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 400, damping: 34 }
                        }
                        className="absolute inset-0 rounded-full bg-card shadow-soft"
                      />
                    )}
                    <span className="relative">
                      {item === "login" ? "ورود" : "ثبت‌نام"}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mb-7 space-y-2 text-center">
                <h1 className="text-xl font-bold">
                  {mode === "login" ? "خوش برگشتید" : "حساب‌تان را بسازید"}
                </h1>
                <p className="text-sm leading-7 text-muted">
                  {mode === "login"
                    ? "برای ادامه وارد حساب پشتیبان شوید."
                    : "بعد از ساخت حساب، ربات تلگرام‌تان را قدم‌به‌قدم وصل می‌کنیم."}
                </p>
              </div>

              {formError && (
                <Alert variant="error" title={formError} className="mb-5" />
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-5">
                <Input
                  label="ایمیل"
                  type="email"
                  dir="ltr"
                  className="text-start"
                  placeholder="you@company.com"
                  autoComplete="email"
                  startIcon={<Mail />}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={fieldErrors.email}
                  required
                />
                <PasswordInput
                  label="رمز عبور"
                  placeholder="••••••••"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={fieldErrors.password}
                  hint={
                    mode === "signup"
                      ? `دست‌کم ${fa(8)} کاراکتر.`
                      : undefined
                  }
                  required
                />
                {mode === "signup" && (
                  <PasswordInput
                    label="تکرار رمز عبور"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    error={fieldErrors.confirm}
                    required
                  />
                )}

                <Button
                  type="submit"
                  loading={loading}
                  className="w-full"
                  endIcon={<ArrowLeft className="size-4" />}
                >
                  {mode === "login" ? "ورود به حساب" : "ساخت حساب و ادامه"}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-6 text-muted">
          با ادامه،{" "}
          <Link
            href="/"
            className="text-foreground underline-offset-4 hover:underline"
          >
            قوانین استفاده
          </Link>{" "}
          و{" "}
          <Link
            href="/"
            className="text-foreground underline-offset-4 hover:underline"
          >
            حریم خصوصی
          </Link>{" "}
          پشتیبان را می‌پذیرید.
        </p>
      </motion.div>
    </main>
  );
};
