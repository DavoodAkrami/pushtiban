import { NextResponse, type NextRequest } from "next/server";
import { generateAssistantReply } from "@/lib/ai/assistant";
import { markdownToTelegramHtml } from "@/lib/telegram/format";
import type { ChatTurn } from "@/lib/ai/memory";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// The assistant preview on /dashboard/assistant.
//
// This deliberately calls `generateAssistantReply` — the exact function the
// Telegram webhook uses — rather than reimplementing the pipeline. Everything
// the customer would get, the owner gets: the same persona, retrieval,
// thresholds from ai_global_settings, escalation tool, provider order, usage
// logging and both platform gates.
//
// The one gate the webhook applies itself, not inside that function, is the
// owner's own `is_enabled` switch, so it is repeated here. Without it the
// preview would answer while the real bot stayed silent — which is precisely
// the kind of divergence that makes a preview worse than useless.
// ---------------------------------------------------------------------------

const MAX_QUESTION_CHARS = 1000;
const MAX_HISTORY_TURNS = 4; // matches the memory window in lib/ai/memory.ts
const MAX_TURN_CHARS = 400;

type PreviewBody = {
  question?: unknown;
  history?: unknown;
};

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

/** Coerce client-held turns into the shape the generator expects. */
const parseHistory = (value: unknown): ChatTurn[] => {
  if (!Array.isArray(value)) return [];
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    turns.push({ role, text: text.slice(0, MAX_TURN_CHARS) });
  }
  return turns.slice(-MAX_HISTORY_TURNS);
};

export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return NextResponse.json(
      { error: "درخواست معتبر نیست؛ صفحه را تازه کنید." },
      { status: 403 }
    );
  }

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

  let body: PreviewBody;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return NextResponse.json(
      { error: "اطلاعات قابل خواندن نیست." },
      { status: 400 }
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "پیام خالی است." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json(
      { error: "پیام طولانی‌تر از حد مجاز است." },
      { status: 400 }
    );
  }

  // Owner's own switch — the same one the webhook checks before reaching the AI.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("ai_assistant_settings")
    .select("is_enabled, human_handoff_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settings?.is_enabled !== true) {
    return NextResponse.json(
      {
        error:
          "دستیار خاموش است. برای آزمایش، ابتدا «پاسخ‌گویی هوشمند» را روشن کنید.",
        assistantDisabled: true,
      },
      { status: 409 }
    );
  }

  const handoffEnabled = settings?.human_handoff_enabled === true;

  const result = await generateAssistantReply(question, user.id, {
    handoffEnabled,
    history: parseHistory(body.history),
  });

  // The platform kill switch and the monthly caps both return a null text
  // without throwing, exactly as they do for a real customer.
  if (result.text === null && !result.needsHuman) {
    return NextResponse.json(
      {
        error:
          "دستیار در دسترس نیست — سهمیهٔ این ماه پر شده یا مدیر سایت هوش مصنوعی را موقتاً خاموش کرده است.",
        blocked: true,
      },
      { status: 429 }
    );
  }

  return NextResponse.json({
    // Telegram renders none of the model's Markdown, so the customer sees the
    // converted HTML. Showing the same conversion here means the preview shows
    // real formatting instead of raw **stars**.
    html: result.text ? markdownToTelegramHtml(result.text) : null,
    text: result.text,
    needsHuman: result.needsHuman,
    handoffEnabled,
    retrieval: result.retrieval ?? null,
  });
};
