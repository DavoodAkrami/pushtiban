import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

type AdminRow = {
  id: string;
  telegram_connection_id: string;
  admin_telegram_id: number;
  admin_display_name: string | null;
  created_at: string;
};

/** GET /api/telegram/admins?botId=... — list the admins added by this owner. */
export const GET = async (request: NextRequest) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده", 401);

  const botId = new URL(request.url).searchParams.get("botId");
  if (!botId) return jsonError("botId الزامی است", 400);

  const { data, error } = await supabase
    .from("bot_admins")
    .select("id, telegram_connection_id, admin_telegram_id, admin_display_name, created_at")
    .eq("user_id", user.id)
    .eq("telegram_connection_id", botId)
    .order("created_at", { ascending: true });

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی صندوق کامل نشده؛ اسکریپت inbox.sql را اجرا کنید."
        : "بارگذاری ناموفق بود",
      setupRequired ? 503 : 500
    );
  }

  return NextResponse.json({ admins: ((data as AdminRow[]) ?? []) });
};

/** POST /api/telegram/admins — add a new admin by Telegram numeric id. Body: { connectionId, adminTelegramId, adminDisplayName? }. */
export const POST = async (request: NextRequest) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده", 401);

  let body: {
    connectionId?: unknown;
    adminTelegramId?: unknown;
    adminDisplayName?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("بدنه قابل خواندن نیست", 400);
  }

  const connectionId =
    typeof body.connectionId === "string" ? body.connectionId : "";
  const adminTelegramId =
    typeof body.adminTelegramId === "number" && Number.isFinite(body.adminTelegramId)
      ? Math.floor(body.adminTelegramId)
      : null;
  const adminDisplayName =
    typeof body.adminDisplayName === "string"
      ? body.adminDisplayName.trim().slice(0, 200)
      : null;

  if (!connectionId) return jsonError("شناسه اتصال الزامی است", 400);
  if (!adminTelegramId || adminTelegramId <= 0) {
    return jsonError("شناسه تلگرام معتبر نیست", 400);
  }

  const { data, error } = await supabase
    .from("bot_admins")
    .insert({
      telegram_connection_id: connectionId,
      user_id: user.id,
      admin_telegram_id: adminTelegramId,
      admin_display_name: adminDisplayName,
    })
    .select("id, telegram_connection_id, admin_telegram_id, admin_display_name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError("این ادمین قبلاً اضافه شده", 409);
    }
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired ? "راه‌اندازی صندوق کامل نشده" : "افزودن ناموفق بود",
      setupRequired ? 503 : 500
    );
  }

  return NextResponse.json({ admin: data as AdminRow }, { status: 201 });
};

/** DELETE /api/telegram/admins — remove an admin. Body: { id }. */
export const DELETE = async (request: NextRequest) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده", 401);

  let body: { id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("بدنه قابل خواندن نیست", 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return jsonError("شناسه الزامی است", 400);

  const { error } = await supabase
    .from("bot_admins")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return jsonError("حذف ناموفق بود", 500);

  return NextResponse.json({ ok: true });
};
