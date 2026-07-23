import { NextResponse, type NextRequest } from "next/server";
import { isEmbeddingsConfigured } from "@/configs";
import { embedChunks, splitIntoChunks } from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 200_000; // 200 KB per ingest request
const TITLE_MAX_LENGTH = 200;
const MAX_CHUNKS_PER_USER = 500; // hard ceiling on total stored chunks per user
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

type IngestBody = {
  title?: unknown;
  text?: unknown;
  sourceType?: unknown;
};

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

/**
 * Ingest a text document: split it into overlapping chunks, embed each chunk,
 * and store the embeddings in `knowledge_chunks` for vector similarity search.
 * The parent row lives in `knowledge_sources`. All scoped to the signed-in
 * user; the service-role client writes past RLS.
 */
export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError("درخواست معتبر نیست؛ صفحه را تازه کنید.", 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("سند بزرگ‌تر از حد مجاز است.", 413);
  }

  // Embeddings provider must be configured for ingest to be useful.
  if (!isEmbeddingsConfigured()) {
    return jsonError(
      "ابتدا OPENAI_API_KEY را تنظیم کنید تا امبدینگ ساخته شود.",
      409
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);
  }

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  const sourceType = body.sourceType === "url" ? "url" : "text";

  if (!title || title.length > TITLE_MAX_LENGTH) {
    return jsonError("عنوان باید بین ۱ تا ۲۰۰ نویسه باشد.", 400);
  }
  if (!text.trim()) {
    return jsonError("متن سند خالی است.", 400);
  }

  // Prepend the title to the body so the first chunk naturally contains it
  // and the title's semantic signal spreads across every chunk's embedding.
  // We embed the title-prefixed text but store the clean body as `content`.
  const bodyChunks = splitIntoChunks(text);
  if (!bodyChunks.length) {
    return jsonError("متن سند قابل بخش‌بندی نیست.", 400);
  }

  // For embedding: prefix each chunk with the title so the vector carries both
  // the document identity and the chunk's own meaning. For storage: keep the
  // raw chunk text clean so the LLM sees only the actual content.
  const chunksToEmbed = bodyChunks.map(
    (chunk) => `# ${title}\n\n${chunk}`
  );

  const embeddings = await embedChunks(chunksToEmbed);
  if (!embeddings || embeddings.length !== bodyChunks.length) {
    return jsonError("ساخت امبدینگ ناموفق بود؛ دوباره تلاش کنید.", 502);
  }

  try {
    const admin = createAdminClient();

    // 0. Enforce a per-user chunk ceiling so one account can't bloat the
    // vector store (and token cost) without bound.
    const { count: existingChunks, error: countError } = await admin
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      return jsonError("سهمیه پایگاه دانش بررسی نشد.", 500);
    }
    if ((existingChunks ?? 0) + bodyChunks.length > MAX_CHUNKS_PER_USER) {
      return jsonError(
        "سهمیه پایگاه دانش شما پر شده؛ سندهای قدیمی را حذف کنید.",
        409
      );
    }

    // 1. Create the knowledge source row.
    const { data: source, error: sourceError } = await admin
      .from("knowledge_sources")
      .insert({
        user_id: user.id,
        title,
        source_type: sourceType,
        status: "processing",
        raw_text: text,
      })
      .select("id")
      .single();

    if (sourceError || !source) {
      return jsonError("ذخیره سند ناموفق بود.", 500);
    }

    const sourceId = source.id;

    // Insert all chunk rows with embeddings in one batch.
    const chunkRows = bodyChunks.map((content, index) => ({
      source_id: sourceId,
      user_id: user.id,
      chunk_index: index,
      content,
      embedding: embeddings[index] ?? [],
    }));

    const { error: chunksError } = await admin
      .from("knowledge_chunks")
      .insert(chunkRows);

    if (chunksError) {
      // Roll back the source row so we don't leave orphans.
      await admin.from("knowledge_sources").delete().eq("id", sourceId);
      const setupRequired = SETUP_ERROR_CODES.has(chunksError.code);
      return jsonError(
        setupRequired
          ? "راه‌اندازی RAG کامل نشده؛ اسکریپت rag.sql را اجرا کنید."
          : "ذخیره بخش‌ها ناموفق بود.",
        setupRequired ? 503 : 500,
        setupRequired
      );
    }

    // 3. Mark the source ready.
    await admin
      .from("knowledge_sources")
      .update({ status: "ready" })
      .eq("id", sourceId);

    return NextResponse.json({
      sourceId,
      chunks: chunkRows.length,
    });
  } catch {
    return jsonError("ذخیره سند ناموفق بود.", 500);
  }
};
