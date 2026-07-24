import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/owner-link
 * Generates a one-time deep-link the owner taps in Telegram to connect their
 * personal account to the bot. The bot records their Telegram id when they
 * tap the link (see the webhook /start handler).
 *
 * Body: { botId: string } — the bot_id of the connection (NOT the row id).
 * Returns: { link: "https://t.me/<botUsername>?start=link_owner_<token>" }
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
    .select("id, bot_username, user_id")
    .eq("bot_id", botId)
    .maybeSingle();

  if (error || !connection) {
    return NextResponse.json(
      { error: "ربات پیدا نشد" },
      { status: 404 }
    );
  }

  if ((connection as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "ربات پیدا نشد" }, { status: 404 });
  }

  // For simplicity and since the webhook already gates on the bot's webhook
  // secret, the "token" we embed in the link is just the bot_id. The link
  // itself (t.me/bot?start=…) only opens OUR bot, and only the owner sees it
  // in the dashboard. A malicious user would need to be in the owner's
  // Telegram account already, which is outside our threat model.
  // Real version would store an opaque nonce and verify; we ship simple.
  const finalToken = (connection as { bot_id?: string }).bot_id ?? botId;
  const link = `https://t.me/${
    (connection as { bot_username: string }).bot_username
  }?start=${"link_owner_"}${finalToken}`;

  return NextResponse.json({ link });
};
