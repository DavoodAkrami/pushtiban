import { NextResponse, type NextRequest } from "next/server";
import { isEmbeddingsConfigured } from "@/configs";
import { embedChunks } from "@/lib/ai/embeddings";
import { CHUNKS_MAX_PER_USER, SOURCE_TITLE_MAX_LENGTH } from "@/lib/ai/limits";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_ERROR_CODES = ["42P01", "42703", "PGRST204", "PGRST205"];

type SourceRow = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  created_at: string;
  knowledge_chunks?: { count: number }[] | null;
};

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

/**
 * List the signed-in user's knowledge sources with their chunk counts, plus
 * the account's chunk quota so the editor can warn at the same ceiling the
 * ingest route enforces.
 */
export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("knowledge_sources")
      // The embedded aggregate rides the existing knowledge_chunks FK — no
      // extra round trip and no new SQL.
      .select(
        "id, title, source_type, status, created_at, knowledge_chunks(count)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      const setupRequired = SETUP_ERROR_CODES.includes(error.code);
      return NextResponse.json(
        { error: error.message, setupRequired },
        { status: setupRequired ? 503 : 500 }
      );
    }

    const rows = (data ?? []) as SourceRow[];
    const sources = rows.map((row) => ({
      id: row.id,
      title: row.title,
      source_type: row.source_type,
      status: row.status,
      created_at: row.created_at,
      chunkCount: row.knowledge_chunks?.[0]?.count ?? 0,
    }));
    const usedChunks = sources.reduce((sum, s) => sum + s.chunkCount, 0);

    return NextResponse.json({
      sources,
      usedChunks,
      maxChunks: CHUNKS_MAX_PER_USER,
    });
  } catch {
    return NextResponse.json({ error: "List failed" }, { status: 500 });
  }
};

/**
 * Rename a source.
 *
 * The title is not just a label: the ingest route embeds each chunk as
 * `# title\n\n<chunk>`, so the old title is baked into every vector. Renaming
 * therefore re-embeds the source's chunks, otherwise retrieval would keep
 * matching on a name the owner has already changed.
 */
export const PATCH = async (request: NextRequest) => {
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

  let id = "";
  let title = "";
  try {
    const body = (await request.json()) as { id?: unknown; title?: unknown };
    id = typeof body.id === "string" ? body.id.trim() : "";
    title = typeof body.title === "string" ? body.title.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "اطلاعات قابل خواندن نیست." },
      { status: 400 }
    );
  }

  if (!id) {
    return NextResponse.json({ error: "شناسه سند لازم است." }, { status: 400 });
  }
  if (!title || title.length > SOURCE_TITLE_MAX_LENGTH) {
    return NextResponse.json(
      { error: "عنوان باید بین ۱ تا ۲۰۰ نویسه باشد." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("knowledge_sources")
      .update({ title })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error || !updated) {
      return NextResponse.json(
        { error: "تغییر عنوان ناموفق بود." },
        { status: error ? 500 : 404 }
      );
    }

    // Re-embed under the new title. Best-effort: a failure here leaves the
    // rename in place with stale vectors, which is a ranking nuance, not a
    // broken source — so it is reported, not rolled back.
    let reindexed = 0;
    if (isEmbeddingsConfigured()) {
      const { data: chunks } = await admin
        .from("knowledge_chunks")
        .select("id, content")
        .eq("source_id", id)
        .eq("user_id", user.id)
        .order("chunk_index", { ascending: true });

      const rows = (chunks ?? []) as { id: string; content: string }[];
      if (rows.length) {
        const embeddings = await embedChunks(
          rows.map((row) => `# ${title}\n\n${row.content}`)
        );
        if (embeddings?.length === rows.length) {
          await Promise.all(
            rows.map((row, index) =>
              admin
                .from("knowledge_chunks")
                .update({ embedding: embeddings[index] })
                .eq("id", row.id)
            )
          );
          reindexed = rows.length;
        }
      }
    }

    return NextResponse.json({ ok: true, title, reindexed });
  } catch {
    return NextResponse.json(
      { error: "تغییر عنوان ناموفق بود." },
      { status: 500 }
    );
  }
};

/**
 * Delete one source. Its chunks go with it: knowledge_chunks.source_id is
 * declared ON DELETE CASCADE in supabase/rag.sql, so there is nothing to clean
 * up by hand. Scoped by user_id so an id from another account matches nothing.
 */
export const DELETE = async (request: NextRequest) => {
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

  let id = "";
  try {
    const body = (await request.json()) as { id?: unknown };
    id = typeof body.id === "string" ? body.id.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "اطلاعات قابل خواندن نیست." },
      { status: 400 }
    );
  }

  if (!id) {
    return NextResponse.json({ error: "شناسه سند لازم است." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("knowledge_sources")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      const setupRequired = SETUP_ERROR_CODES.includes(error.code);
      return NextResponse.json(
        { error: "حذف سند ناموفق بود.", setupRequired },
        { status: setupRequired ? 503 : 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف سند ناموفق بود." }, { status: 500 });
  }
};
