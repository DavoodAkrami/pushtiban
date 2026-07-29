import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "نشست شما تمام شده؛ دوباره وارد حساب شوید." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("telegram_connections")
      .select("bot_id, bot_name, bot_username")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ bot: null });
    }

    return NextResponse.json({
      bot: {
        id: data.bot_id,
        name: data.bot_name,
        username: data.bot_username,
      },
    });
  } catch {
    return NextResponse.json({ bot: null });
  }
};
