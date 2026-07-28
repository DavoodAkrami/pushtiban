import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  recordOwnerReply,
  closeConversation,
  type SupportConversationRow,
} from "@/lib/ai/inbox";
import { decryptTelegramToken } from "@/lib/telegram/token-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

type ConversationView = {
  id: string;
  customerDisplayName: string | null;
  customerUsername: string | null;
  lastCustomerMessageText: string | null;
  lastCustomerMessageAt: string | null;
  status: SupportConversationRow["status"];
  queuedReason: SupportConversationRow["queued_reason"];
  createdAt: string;
};

/** GET /api/inbox — list the signed-in user's support conversations. */
export const GET = async (request: NextRequest) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  const requestedStatus = new URL(request.url).searchParams.get("status");
  const status = requestedStatus === "answered" || requestedStatus === "all"
    ? requestedStatus
    : "open";

  let query = supabase
    .from("support_conversations")
    .select(
      "id, customer_display_name, customer_username, last_customer_message_text, last_customer_message_at, status, queued_reason, created_at"
    )
    .eq("user_id", user.id)
    .order("last_customer_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی صندوق پیام‌ها کامل نشده؛ اسکریپت inbox.sql را اجرا کنید."
        : "بارگذاری صندوق ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  const rows = (data as SupportConversationRow[]) ?? [];

  const conversations: ConversationView[] = rows.map((row) => ({
    id: row.id,
    customerDisplayName: row.customer_display_name,
    customerUsername: row.customer_username,
    lastCustomerMessageText: row.last_customer_message_text,
    lastCustomerMessageAt: row.last_customer_message_at,
    status: row.status,
    queuedReason: row.queued_reason,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ conversations });
};

/** POST /api/inbox — owner sends a reply from the website. Body: { conversationId, text }. */
export const POST = async (request: NextRequest) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: { conversationId?: unknown; text?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!conversationId) return jsonError("شناسه گفتگو الزامی است.", 400);
  if (!text || text.length > 4000) return jsonError("متن پاسخ معتبر نیست.", 400);

  // Verify the conversation belongs to this user (RLS also enforces).
  const { data: conv } = await supabase
    .from("support_conversations")
    .select("id, telegram_connection_id, customer_telegram_id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conv) return jsonError("گفتگو پیدا نشد.", 404);

  const conversation = conv as {
    id: string;
    telegram_connection_id: string;
    customer_telegram_id: number;
  };

  // Deliver the reply to the customer via the bot.
  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("telegram_connections")
    .select("token_ciphertext")
    .eq("id", conversation.telegram_connection_id)
    .maybeSingle();
  const tokenRow = connection as { token_ciphertext: string } | null;
  if (!tokenRow) return jsonError("ربات پیدا نشد.", 500);

  let token = "";
  try {
    token = decryptTelegramToken(tokenRow.token_ciphertext);
  } catch {
    return jsonError("ارسال پاسخ ناموفق بود؛ توکن ربات قابل خواندن نیست.", 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: conversation.customer_telegram_id,
        text: `پاسخ پشتیبان:\n\n${text}`,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return jsonError("ارسال پاسخ به تلگرام ناموفق بود.", 502);
  } catch {
    return jsonError("ارسال پاسخ به تلگرام ناموفق بود.", 502);
  } finally {
    clearTimeout(timeout);
  }

  // Only mark the conversation answered after Telegram accepted the reply.
  await recordOwnerReply({ conversationId, replyText: text });

  return NextResponse.json({ ok: true });
};

/** DELETE /api/inbox — close a conversation. Body: { conversationId }. */
export const DELETE = async (request: NextRequest) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: { conversationId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  if (!conversationId) return jsonError("شناسه گفتگو الزامی است.", 400);

  // RLS check — only the owner can close their own conversations.
  const { data: conv } = await supabase
    .from("support_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conv) return jsonError("گفتگو پیدا نشد.", 404);

  await closeConversation(conversationId);
  return NextResponse.json({ ok: true });
};
