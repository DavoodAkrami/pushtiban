import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export const POST = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "نشست شما تمام شده؛ دوباره وارد حساب شوید." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("telegram_connections")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: "قطع اتصال انجام نشد؛ دوباره تلاش کنید." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "قطع اتصال انجام نشد؛ دوباره تلاش کنید." }, { status: 500 });
  }
};
