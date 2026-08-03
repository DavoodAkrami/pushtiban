import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstagramConnection } from "@/lib/instagram/connection";

export const runtime = "nodejs";

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

  try {
    const admin = createAdminClient();
    const connection = await getInstagramConnection(admin, user.id);

    if (!connection) return NextResponse.json({ account: null });

    return NextResponse.json({
      account: {
        id: connection.instagramUserId,
        username: connection.username,
        name: connection.accountName,
        avatarUrl: connection.profilePictureUrl,
        accountType: connection.accountType,
        status: connection.status,
      },
    });
  } catch {
    // The screen stays usable before supabase/instagram.sql has been run.
    return NextResponse.json({ account: null });
  }
};
