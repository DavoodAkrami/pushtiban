import { NextResponse, type NextRequest } from "next/server";
import { getUsageSeries, isUsageRange } from "@/lib/ai/usage";
import { requireSiteAdmin } from "@/lib/auth/site-admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

/**
 * GET — bucketed token/message usage for the usage charts.
 *
 * `range`: week (7 days) | month (30 days) | year (12 months)
 * `scope`:
 *   - `self` (default) — the signed-in business's own usage
 *   - `platform` — every business combined (site admins only)
 *   - `business` — one business by `userId` (site admins only)
 */
export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const rangeParam = params.get("range") ?? "week";
  if (!isUsageRange(rangeParam)) {
    return jsonError("بازه زمانی معتبر نیست.", 400);
  }

  const scope = params.get("scope") ?? "self";
  if (scope !== "self" && scope !== "platform" && scope !== "business") {
    return jsonError("دامنه درخواست معتبر نیست.", 400);
  }

  if (scope === "self") {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
    }
    return NextResponse.json(
      await getUsageSeries({ range: rangeParam, userId: user.id })
    );
  }

  // Platform-wide and other-business usage are admin-only.
  const guard = await requireSiteAdmin();
  if (!guard.ok) {
    return jsonError(
      guard.status === 401
        ? "نشست شما تمام شده؛ دوباره وارد حساب شوید."
        : "دسترسی به این بخش مخصوص مدیر سایت است.",
      guard.status
    );
  }

  if (scope === "platform") {
    return NextResponse.json(await getUsageSeries({ range: rangeParam }));
  }

  const userId = params.get("userId")?.trim();
  if (!userId) return jsonError("شناسه کسب‌وکار معتبر نیست.", 400);
  return NextResponse.json(await getUsageSeries({ range: rangeParam, userId }));
};
