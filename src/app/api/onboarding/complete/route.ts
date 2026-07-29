import { NextResponse, type NextRequest } from "next/server";
import { isBusinessCategory } from "@/lib/business-categories";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_024;

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.", 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("اطلاعات واردشده بیش از حد طولانی است.", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  let fullName = "";
  let businessName = "";
  let businessCategory = "";
  let telegramSkipped = false;

  try {
    const body = (await request.json()) as {
      fullName?: unknown;
      businessName?: unknown;
      businessCategory?: unknown;
      telegramSkipped?: unknown;
    };
    fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    businessName =
      typeof body.businessName === "string" ? body.businessName.trim() : "";
    businessCategory =
      typeof body.businessCategory === "string"
        ? body.businessCategory.trim()
        : "";
    telegramSkipped = body.telegramSkipped === true;
  } catch {
    return jsonError("نام و نام کسب‌وکار را دوباره وارد کنید.", 400);
  }

  if (fullName.length < 3 || fullName.length > 80) {
    return jsonError("نام و نام خانوادگی باید بین ۳ تا ۸۰ کاراکتر باشد.", 400);
  }
  if (businessName.length < 2 || businessName.length > 100) {
    return jsonError("نام کسب‌وکار باید بین ۲ تا ۱۰۰ کاراکتر باشد.", 400);
  }
  if (!isBusinessCategory(businessCategory)) {
    return jsonError("دسته کسب‌وکار را از فهرست انتخاب کنید.", 400);
  }

  try {
    const admin = createAdminClient();
    const { error: userError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        full_name: fullName,
        business_name: businessName,
        business_category: businessCategory,
      },
    });

    if (userError) {
      return jsonError("ذخیره نام انجام نشد؛ دوباره تلاش کنید.", 500);
    }

    const completedAt = new Date().toISOString();
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        business_name: businessName,
        onboarding_completed_at: completedAt,
        telegram_skipped_at: telegramSkipped ? completedAt : null,
      })
      .eq("id", user.id);

    if (profileError) {
      return jsonError(
        "ذخیره اطلاعات کسب‌وکار انجام نشد؛ تنظیمات پایگاه‌داده را بررسی کنید.",
        500
      );
    }

    // Written separately so an environment that has not run the latest
    // supabase/onboarding.sql (no business_category column) still completes
    // onboarding — the category is also kept in user metadata above.
    const { error: categoryError } = await admin
      .from("profiles")
      .update({ business_category: businessCategory })
      .eq("id", user.id);

    if (categoryError) {
      console.warn(
        "profiles.business_category not saved; run supabase/onboarding.sql:",
        categoryError.message
      );
    }
  } catch {
    return jsonError("اتصال امن سرور هنوز کامل تنظیم نشده است.", 500);
  }

  return NextResponse.json({ ok: true });
};
