import { NextResponse, type NextRequest } from "next/server";
import { isEmbeddingsConfigured } from "@/configs";
import { embedChunks } from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Read and edit the individual chunks of a knowledge source.
//
// A chunk's stored `content` is what the model actually reads, and its
// `embedding` is what retrieval searches. Editing the text without re-embedding
// would silently desync the two — the chunk would be *found* by its old wording
// and *answered from* by its new one. So every content edit re-embeds, using
// the same `# title\n\n…` prefix convention the ingest route uses.
// ---------------------------------------------------------------------------

const CHUNK_MAX_CHARS = 4000;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const requireUser = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

/** List one source's chunks, in order. */
export const GET = async (request: NextRequest) => {
  const user = await requireUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  if (!sourceId) return jsonError("شناسه منبع لازم است.", 400);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("knowledge_chunks")
      .select("id, chunk_index, content, category")
      .eq("source_id", sourceId)
      .eq("user_id", user.id)
      .order("chunk_index", { ascending: true });

    if (error) {
      const setupRequired = SETUP_ERROR_CODES.has(error.code);
      return jsonError(
        "بارگذاری بخش‌ها ناموفق بود.",
        setupRequired ? 503 : 500,
        setupRequired
      );
    }

    return NextResponse.json({ chunks: data ?? [] });
  } catch {
    return jsonError("بارگذاری بخش‌ها ناموفق بود.", 500);
  }
};

/** Update one chunk's text and re-embed it so retrieval stays in sync. */
export const PATCH = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید.", 403);
  }

  const user = await requireUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  if (!isEmbeddingsConfigured()) {
    return jsonError(
      "ویرایش بخش بدون کلید امبدینگ ممکن نیست؛ OPENAI_API_KEY را تنظیم کنید.",
      409
    );
  }

  let id = "";
  let content = "";
  try {
    const body = (await request.json()) as { id?: unknown; content?: unknown };
    id = typeof body.id === "string" ? body.id.trim() : "";
    content = typeof body.content === "string" ? body.content : "";
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  if (!id) return jsonError("شناسه بخش لازم است.", 400);
  if (!content.trim()) return jsonError("متن بخش نمی‌تواند خالی باشد.", 400);
  if (content.length > CHUNK_MAX_CHARS) {
    return jsonError("متن بخش طولانی‌تر از حد مجاز است.", 400);
  }

  try {
    const admin = createAdminClient();

    // The title feeds the embedding, so it has to be read before embedding.
    const { data: chunk, error: readError } = await admin
      .from("knowledge_chunks")
      .select("id, source_id, knowledge_sources(title)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError || !chunk) return jsonError("این بخش پیدا نشد.", 404);

    const joined = (chunk as { knowledge_sources?: { title?: string } | null })
      .knowledge_sources;
    const title = joined?.title ?? "";

    const embeddings = await embedChunks([`# ${title}\n\n${content}`]);
    if (!embeddings?.[0]) {
      return jsonError("ساخت امبدینگ ناموفق بود؛ دوباره تلاش کنید.", 502);
    }

    const { error: updateError } = await admin
      .from("knowledge_chunks")
      .update({ content, embedding: embeddings[0] })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) return jsonError("ذخیره بخش ناموفق بود.", 500);

    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("ذخیره بخش ناموفق بود.", 500);
  }
};

/** Remove a single chunk without touching the rest of its source. */
export const DELETE = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید.", 403);
  }

  const user = await requireUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  let id = "";
  try {
    const body = (await request.json()) as { id?: unknown };
    id = typeof body.id === "string" ? body.id.trim() : "";
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }
  if (!id) return jsonError("شناسه بخش لازم است.", 400);

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("knowledge_chunks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return jsonError("حذف بخش ناموفق بود.", 500);
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("حذف بخش ناموفق بود.", 500);
  }
};
