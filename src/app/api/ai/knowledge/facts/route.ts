import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FACT_TEXT_MAX = 1000;
const CATEGORY_MAX = 80;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

type FactRow = {
  id: string;
  category: string;
  fact_text: string;
  created_at: string;
  updated_at: string;
};

const toFact = (row: FactRow) => ({
  id: row.id,
  category: row.category,
  factText: row.fact_text,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** GET /api/ai/knowledge/facts — list the signed-in user's business facts. */
export const GET = async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  const { data, error } = await supabase
    .from("ai_knowledge_facts")
    .select("id, category, fact_text, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "بارگذاری اطلاعات ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ facts: ((data as FactRow[]) ?? []).map(toFact) });
};

/** POST /api/ai/knowledge/facts — add a new business fact. */
export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: { factText?: unknown; category?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const factText = typeof body.factText === "string" ? body.factText.trim() : "";
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim().slice(0, CATEGORY_MAX)
      : "general";

  if (!factText || factText.length > FACT_TEXT_MAX) {
    return jsonError("متن اطلاعات باید بین ۱ تا ۱۰۰۰ نویسه باشد.", 400);
  }

  const { data, error } = await supabase
    .from("ai_knowledge_facts")
    .insert({ user_id: user.id, category, fact_text: factText })
    .select("id, category, fact_text, created_at, updated_at")
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "ذخیره اطلاعات ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ fact: toFact(data as FactRow) }, { status: 201 });
};

/** PUT /api/ai/knowledge/facts — update an existing fact (id in body). */
export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: { id?: unknown; factText?: unknown; category?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const factText = typeof body.factText === "string" ? body.factText.trim() : "";
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim().slice(0, CATEGORY_MAX)
      : "general";

  if (!id) return jsonError("شناسه اطلاعات الزامی است.", 400);
  if (!factText || factText.length > FACT_TEXT_MAX) {
    return jsonError("متن اطلاعات باید بین ۱ تا ۱۰۰۰ نویسه باشد.", 400);
  }

  const { data, error } = await supabase
    .from("ai_knowledge_facts")
    .update({ fact_text: factText, category })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, category, fact_text, created_at, updated_at")
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "به‌روزرسانی اطلاعات ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ fact: toFact(data as FactRow) });
};

/** DELETE /api/ai/knowledge/facts — delete a fact (id in body). */
export const DELETE = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: { id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return jsonError("شناسه اطلاعات الزامی است.", 400);

  const { error } = await supabase
    .from("ai_knowledge_facts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "حذف اطلاعات ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ ok: true });
};
