import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  recordOwnerReply,
  closeConversation,
  deliverConversationReply,
  type SupportChannel,
  type SupportConversationRow,
} from "@/lib/ai/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

type ConversationView = {
  id: string;
  channel: SupportChannel;
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
  const supabase = await createClient();
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
      "id, channel, customer_display_name, customer_username, last_customer_message_text, last_customer_message_at, status, queued_reason, created_at"
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
    // Defaulted rather than assumed: rows written before channel-inbox.sql ran
    // have no channel column, and every one of those is Telegram.
    channel: row.channel ?? "telegram",
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
  const supabase = await createClient();
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
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conv) return jsonError("گفتگو پیدا نشد.", 404);

  const conversation = conv as SupportConversationRow;

  // Delivery follows the channel the customer is on — Telegram's bot API or
  // Instagram's messaging API with the human-agent tag.
  const delivered = await deliverConversationReply({ conversation, text });
  if (!delivered) {
    return jsonError(
      conversation.channel === "instagram"
        ? "ارسال پاسخ به اینستاگرام انجام نشد؛ ممکن است مهلت ۷ روزهٔ پاسخ‌گویی تمام شده باشد."
        : "ارسال پاسخ به تلگرام ناموفق بود.",
      502
    );
  }

  // Only mark the conversation answered after the channel accepted the reply.
  await recordOwnerReply({ conversationId, replyText: text });

  return NextResponse.json({ ok: true });
};

/** DELETE /api/inbox — close a conversation. Body: { conversationId }. */
export const DELETE = async (request: NextRequest) => {
  const supabase = await createClient();
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
