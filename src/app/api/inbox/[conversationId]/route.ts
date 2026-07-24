import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type SupportConversationRow,
  type SupportMessageRow,
} from "@/lib/ai/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

type RouteContext = { params: { conversationId: string } };

/** GET /api/inbox/[conversationId] — fetch a conversation + its transcript. */
export const GET = async (_request: NextRequest, context: RouteContext) => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  const { conversationId } = context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
    return jsonError("شناسه گفتگو معتبر نیست.", 400);
  }

  const { data: conv, error: convError } = await supabase
    .from("support_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convError) {
    const setupRequired = SETUP_ERROR_CODES.has(convError.code);
    return jsonError(
      setupRequired ? "راه‌اندازی صندوق کامل نشده." : "بارگذاری گفتگو ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }
  if (!conv) return jsonError("گفتگو پیدا نشد.", 404);

  const conversation = conv as SupportConversationRow;

  const { data: msgRows, error: msgError } = await supabase
    .from("support_messages")
    .select("id, conversation_id, role, content, sender_telegram_id, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (msgError) {
    return jsonError("بارگذاری پیام‌ها ناموفق بود.", 500);
  }

  const messages: SupportMessageRow[] = ((msgRows as SupportMessageRow[]) ?? []).map(
    (row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      sender_telegram_id: row.sender_telegram_id,
      created_at: row.created_at,
    })
  );

  return NextResponse.json({ conversation, messages });
};
