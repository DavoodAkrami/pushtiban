import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmbeddingsConfigured } from "@/configs";
import { embedQuery } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUESTION_MAX = 500;
const ANSWER_MAX = 2000;
const CATEGORY_MAX = 80;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

type QaRow = {
  id: string;
  category: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
};

const toQa = (row: QaRow) => ({
  id: row.id,
  category: row.category,
  question: row.question,
  answer: row.answer,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** GET /api/ai/knowledge/qa — list the signed-in user's Q&A pairs. */
export const GET = async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  const { data, error } = await supabase
    .from("ai_knowledge_qa")
    .select("id, category, question, answer, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "بارگذاری پرسش و پاسخ ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ qa: ((data as QaRow[]) ?? []).map(toQa) });
};

/** POST /api/ai/knowledge/qa — create a new Q&A pair (embeds the question). */
export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: { question?: unknown; answer?: unknown; category?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim().slice(0, CATEGORY_MAX)
      : "general";

  if (!question || question.length > QUESTION_MAX) {
    return jsonError("پرسش باید بین ۱ تا ۵۰۰ نویسه باشد.", 400);
  }
  if (!answer || answer.length > ANSWER_MAX) {
    return jsonError("پاسخ باید بین ۱ تا ۲۰۰۰ نویسه باشد.", 400);
  }

  // Embed the question so the Q&A can be matched against user queries.
  const embedding = isEmbeddingsConfigured()
    ? await embedQuery(question).catch(() => null)
    : null;

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    category,
    question,
    answer,
  };
  if (embedding) insertPayload.question_embedding = embedding;

  const { data, error } = await supabase
    .from("ai_knowledge_qa")
    .insert(insertPayload)
    .select("id, category, question, answer, created_at, updated_at")
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "ذخیره پرسش و پاسخ ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ qa: toQa(data as QaRow) }, { status: 201 });
};

/** PUT /api/ai/knowledge/qa — update a Q&A pair (re-embeds the question). */
export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: { id?: unknown; question?: unknown; answer?: unknown; category?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim().slice(0, CATEGORY_MAX)
      : "general";

  if (!id) return jsonError("شناسه پرسش الزامی است.", 400);
  if (!question || question.length > QUESTION_MAX) {
    return jsonError("پرسش باید بین ۱ تا ۵۰۰ نویسه باشد.", 400);
  }
  if (!answer || answer.length > ANSWER_MAX) {
    return jsonError("پاسخ باید بین ۱ تا ۲۰۰۰ نویسه باشد.", 400);
  }

  const embedding = isEmbeddingsConfigured()
    ? await embedQuery(question).catch(() => null)
    : null;

  const updatePayload: Record<string, unknown> = { question, answer, category };
  if (embedding) updatePayload.question_embedding = embedding;

  const { data, error } = await supabase
    .from("ai_knowledge_qa")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, category, question, answer, created_at, updated_at")
    .single();

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "به‌روزرسانی پرسش و پاسخ ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ qa: toQa(data as QaRow) });
};

/** DELETE /api/ai/knowledge/qa — delete a Q&A pair (id in body). */
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
  if (!id) return jsonError("شناسه پرسش الزامی است.", 400);

  const { error } = await supabase
    .from("ai_knowledge_qa")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    const setupRequired = SETUP_ERROR_CODES.has(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی پایگاه دانش کامل نشده؛ اسکریپت knowledge.sql را اجرا کنید."
        : "حذف پرسش و پاسخ ناموفق بود.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ ok: true });
};
