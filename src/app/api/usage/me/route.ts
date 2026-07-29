import { NextResponse } from "next/server";
import { getBusinessUsageSnapshot } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — the signed-in business's own monthly usage against its caps. Read by
 * the dashboard sidebar (remaining messages) and the overview page.
 */
export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "نشست شما تمام شده؛ دوباره وارد حساب شوید." },
      { status: 401 }
    );
  }

  return NextResponse.json({ usage: await getBusinessUsageSnapshot(user.id) });
};
