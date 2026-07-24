import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/admin-link
 * Generates a deep-link the owner shares with a teammate. When the teammate
 * taps it in Telegram, the webhook /start handler upserts a bot_admins row
 * binding their account to this connection (see the webhook ADMIN_LINK_PREFIX
 * branch). The owner does NOT need to know the teammate's numeric id up-front.
 *
 * Body: { botId: string } — the bot_id of the connection (NOT the row id).
 * Returns: { link: "https://t.me/<botUsername>?start=link_admin_<token>" }
 */
export const POST = async (request: NextRequest) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "نشست شما تمام شده" }, { status: 401 });
  }

  let body: { botId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "بدنه قابل خواندن نیست" }, { status: 400 });
  }

  const botId = typeof body.botId === "string" ? body.botId.trim() : "";
  if (!botId) {
    return NextResponse.json({ error: "botId الزامی است" }, { status: 400 });
  }

  // Verify the bot belongs to this user and fetch the bot_username.
  const admin = createAdminClient();
  const { data: connection, error } = await admin
    .from("telegram_connections")
    .select("id, bot_id, bot_username, user_id")
    .eq("bot_id", botId)
    .maybeSingle();

  if (error || !connection) {
    return NextResponse.json({ error: "ربات پیدا نشد" }, { status: 404 });
  }

  if ((connection as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "ربات پیدا نشد" }, { status: 404 });
  }

  // The "token" embedded in the link is the bot_id, mirroring the owner-link
  // flow. The webhook verifies the bot's own webhook secret before acting on
  // the payload, so the deep link alone is not enough to add an admin to a
  // different bot.
  const finalToken = (connection as { bot_id: string }).bot_id;
  const link = `https://t.me/${
    (connection as { bot_username: string }).bot_username
  }?start=${"link_admin_"}${finalToken}`;

  return NextResponse.json({ link });
};
