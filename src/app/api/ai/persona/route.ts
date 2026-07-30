import { NextResponse, type NextRequest } from "next/server";
import {
  PERSONA_INSTRUCTIONS_MAX,
  PERSONA_INTRO_MAX,
  invalidateBusinessPersonaCache,
  isStyleLevel,
  type StyleLevel,
} from "@/lib/ai/persona";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const PERSONA_COLUMNS =
  "business_intro, assistant_instructions, tone_warmth, tone_enthusiasm, format_structure, format_emoji";

type PersonaRow = {
  business_intro: string | null;
  assistant_instructions: string | null;
  tone_warmth: string | null;
  tone_enthusiasm: string | null;
  format_structure: string | null;
  format_emoji: string | null;
};

const asLevel = (value: unknown): StyleLevel =>
  isStyleLevel(value) ? value : "default";

const toPersona = (row: PersonaRow | null) => ({
  intro: row?.business_intro ?? "",
  instructions: row?.assistant_instructions ?? "",
  warmth: asLevel(row?.tone_warmth),
  enthusiasm: asLevel(row?.tone_enthusiasm),
  structure: asLevel(row?.format_structure),
  emoji: asLevel(row?.format_emoji),
});

/** GET /api/ai/persona — the signed-in owner's assistant persona. */
export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  const { data, error } = await supabase
    .from("ai_assistant_settings")
    .select(PERSONA_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی شخصیت دستیار کامل نشده؛ اسکریپت ai-persona.sql را اجرا کنید."
        : "بارگذاری شخصیت دستیار ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ persona: toPersona(data as PersonaRow | null) });
};

/** PUT /api/ai/persona — save the whole persona in one write. */
export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError(
      "درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.",
      403
    );
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonError("درخواست بزرگ‌تر از حد مجاز است.", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("اطلاعات ارسالی قابل خواندن نیست.", 400);
  }

  const intro = typeof body.intro === "string" ? body.intro.trim() : "";
  const instructions =
    typeof body.instructions === "string" ? body.instructions.trim() : "";

  if (intro.length > PERSONA_INTRO_MAX) {
    return jsonError("متن معرفی کسب‌وکار بیش از حد طولانی است.", 400);
  }
  if (instructions.length > PERSONA_INSTRUCTIONS_MAX) {
    return jsonError("متن دستورالعمل دستیار بیش از حد طولانی است.", 400);
  }

  const { data, error } = await supabase
    .from("ai_assistant_settings")
    .upsert(
      {
        user_id: user.id,
        business_intro: intro,
        assistant_instructions: instructions,
        tone_warmth: asLevel(body.warmth),
        tone_enthusiasm: asLevel(body.enthusiasm),
        format_structure: asLevel(body.structure),
        format_emoji: asLevel(body.emoji),
      },
      { onConflict: "user_id" }
    )
    .select(PERSONA_COLUMNS)
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی شخصیت دستیار کامل نشده؛ اسکریپت ai-persona.sql را اجرا کنید."
        : "ذخیره شخصیت دستیار ناموفق بود؛ دوباره تلاش کنید.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  // The Telegram path caches personas for 60s; drop this owner's entry so the
  // next customer message uses the new settings immediately.
  invalidateBusinessPersonaCache(user.id);

  return NextResponse.json({ persona: toPersona(data as PersonaRow) });
};
