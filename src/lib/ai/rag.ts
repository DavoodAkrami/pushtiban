import "server-only";

import { embedQuery } from "@/lib/ai/embeddings";
import {
  getOpenAIClient,
  getNvidiaNimClient,
  isEmbeddingsConfigured,
} from "@/configs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGlobalAiSettings, logAiUsage } from "@/lib/ai/usage";
import {
  DEFAULT_PERSONA,
  REPLY_FORMAT_LINE,
  buildPersonaIdentity,
  buildPersonaLines,
  type BusinessPersona,
} from "@/lib/ai/persona";

export type RagChunk = {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  category: string;
  similarity: number;
};

export type RagSourceMeta = {
  id: string;
  title: string;
};

export type RagFact = {
  id: string;
  category: string;
  factText: string;
};

export type RagQa = {
  id: string;
  question: string;
  answer: string;
  category: string;
  similarity: number;
};

export type RagIntent = {
  /** Detected category: "shipping" | "pricing" | "products" | "returns" | "general" | ... */
  category: string;
  /** Confidence 0..1 — below 0.4 we treat as "general" (no filter). */
  confidence: number;
  /**
   * Condensed search query — the user's message with greetings/filler
   * stripped (e.g. "سلام میخواستم بدونم هزینه ارسال چقدره" → "هزینه ارسال").
   * Embedded instead of the raw message for sharper similarity scores.
   * Null when the model did not return one — caller embeds the raw message.
   */
  searchQuery: string | null;
};

export type RagRetrieval = {
  intent: RagIntent | null;
  chunks: RagChunk[];
  sources: RagSourceMeta[];
  facts: RagFact[];
  qa: RagQa[];
  /** True when the embeddings provider is not configured — caller should fall back. */
  embeddingsUnavailable: boolean;
};

// ---------------------------------------------------------------------------
// Intent extraction — a cheap LLM call that classifies the user's question
// into one of a fixed set of categories AND condenses it into a short search
// query (greetings/filler stripped) used for embedding. Returns null if no
// provider is available (caller falls back to unfiltered retrieval on the
// raw message).
// ---------------------------------------------------------------------------

const INTENT_SYSTEM_PROMPT = [
  "You process a customer-support message for retrieval.",
  'Respond with a JSON object: {"category": "<one of: shipping, pricing, products, returns, account, general>", "confidence": <0..1>, "searchQuery": "<the core question, same language as the user, greetings and filler removed>"}.',
  "Use \"general\" if the question is small-talk, ambiguous, or doesn't fit any category.",
  'searchQuery keeps only the informational core (e.g. "سلام میخواستم بدونم هزینه ارسال چقدره" → "هزینه ارسال چقدر است"). If the message is pure small-talk, return it unchanged.',
  "Return JSON only — no prose, no code fences.",
].join(" ");

const INTENT_TIMEOUT_MS = 8_000;

const requestIntent = async (
  client: NonNullable<ReturnType<typeof getOpenAIClient>>,
  question: string,
  usageUserId?: string
): Promise<RagIntent | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTENT_TIMEOUT_MS);
  try {
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
        max_tokens: 32,
        stream: false,
        temperature: 0,
      },
      { signal: controller.signal }
    );
    if (usageUserId) {
      void logAiUsage({
        userId: usageUserId,
        kind: "intent",
        provider: "openai",
        model: "gpt-4o-mini",
        usage: completion.usage,
      });
    }
    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as {
      category?: string;
      confidence?: number;
      searchQuery?: string;
    };
    const category = typeof parsed.category === "string" ? parsed.category : "general";
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    const searchQuery =
      typeof parsed.searchQuery === "string" && parsed.searchQuery.trim()
        ? parsed.searchQuery.trim()
        : null;
    return { category, confidence, searchQuery };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Ask the LLM to classify the user's question into a category so we can
 * pre-filter the vector search. Falls back to null (no filter) on any error.
 */
export const extractIntent = async (
  question: string,
  usageUserId?: string
): Promise<RagIntent | null> => {
  // Prefer OpenAI (cheap, fast), fall back to NVIDIA NIM.
  const openai = getOpenAIClient();
  if (openai) return requestIntent(openai, question, usageUserId);

  const nvidia = getNvidiaNimClient();
  if (nvidia) return requestIntent(nvidia, question, usageUserId);

  return null;
};

// ---------------------------------------------------------------------------
// Full retrieval pipeline: intent → facts + qa + filtered vector chunks.
// ---------------------------------------------------------------------------

/**
 * Run the complete RAG retrieval for a user question:
 *   1. Extract the intent (category) via an LLM call.
 *   2. Fetch all standing facts (always-on context).
 *   3. Embed the question and match curated Q&A pairs (high-similarity bar).
 *   4. Run filtered vector search on knowledge_chunks (scoped to the
 *      detected category, or unfiltered if intent is null/low-confidence).
 *
 * Returns everything the route needs to build the system prompt and the
 * playground's "what the AI fetched" inspection panel.
 */
export const retrieveRagContext = async ({
  question,
  userId,
  matchCount,
  minSimilarity,
  sourceId = null,
}: {
  question: string;
  userId: string;
  /** Defaults to the admin-set global value when omitted. */
  matchCount?: number;
  /** Defaults to the admin-set global value when omitted. */
  minSimilarity?: number;
  /** Optional hard filter: only retrieve chunks from this knowledge source. */
  sourceId?: string | null;
}): Promise<RagRetrieval> => {
  const admin = createAdminClient();

  // Platform-wide retrieval knobs set by the site admin. Explicit caller
  // arguments (the /ai/rag-test sliders) win over the globals.
  const settings = await getGlobalAiSettings();
  const effectiveMatchCount = matchCount ?? settings.chunkMatchCount;
  const effectiveMinSimilarity = minSimilarity ?? settings.chunkMinSimilarity;

  // 1. Standing facts — always-on context, not vector-retrieved.
  const facts: RagFact[] = [];
  {
    const { data: factRows } = await admin
      .from("ai_knowledge_facts")
      .select("id, category, fact_text")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (factRows) {
      for (const row of factRows as Array<{
        id: string;
        category: string;
        fact_text: string;
      }>) {
        facts.push({ id: row.id, category: row.category, factText: row.fact_text });
      }
    }
  }

  // 2. Embedding-based retrieval (QA + chunks) requires the embeddings provider.
  //    When it isn't configured we skip BOTH the intent LLM call (its category
  //    filter would be unused) and the vector search — returning facts only.
  if (!isEmbeddingsConfigured()) {
    return {
      intent: null,
      chunks: [],
      sources: [],
      facts,
      qa: [],
      embeddingsUnavailable: true,
    };
  }

  // 3. Intent classification runs first because it also produces the
  //    condensed search query we embed (falls back to the raw message when
  //    the intent call fails, returns nothing, or is disabled globally).
  const intent = settings.intentEnabled
    ? await extractIntent(question, userId)
    : null;
  const queryEmbedding = await embedQuery(intent?.searchQuery ?? question);
  if (!queryEmbedding) {
    return {
      intent,
      chunks: [],
      sources: [],
      facts,
      qa: [],
      embeddingsUnavailable: true,
    };
  }

  // The category is a soft ranking boost inside the RPCs (never a hard
  // filter); only pass it when confidence is meaningful.
  const categoryFilter =
    intent && intent.confidence >= 0.4 && intent.category !== "general"
      ? intent.category
      : null;

  // 3. Q&A pair matching — the default threshold 0.45 catches Persian
  //    paraphrases while rejecting unrelated questions; both knobs are
  //    admin-tunable in ai_global_settings.
  const qa: RagQa[] = [];
  {
    const { data: qaRows } = await admin.rpc("match_knowledge_qa", {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      filter_category: categoryFilter,
      match_count: settings.qaMatchCount,
      min_similarity: settings.qaMinSimilarity,
    });
    if (qaRows) {
      for (const row of qaRows as Array<{
        id: string;
        question: string;
        answer: string;
        category: string;
        similarity: number;
      }>) {
        qa.push({
          id: row.id,
          question: row.question,
          answer: row.answer,
          category: row.category,
          similarity: row.similarity,
        });
      }
    }
  }

  // 4. Filtered vector search on knowledge_chunks.
  const chunks: RagChunk[] = [];
  {
    const { data: chunkRows, error } = await admin.rpc(
      "match_knowledge_chunks_filtered",
      {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: effectiveMatchCount,
        filter_category: categoryFilter,
        filter_source_id: sourceId,
        min_similarity: effectiveMinSimilarity,
      }
    );
    if (error) {
      throw new Error(`RAG chunk retrieval failed: ${error.message}`);
    }
    if (chunkRows) {
      for (const row of chunkRows as Array<{
        id: string;
        source_id: string;
        chunk_index: number;
        content: string;
        category: string;
        similarity: number;
      }>) {
        chunks.push({
          id: row.id,
          sourceId: row.source_id,
          chunkIndex: row.chunk_index,
          content: row.content,
          category: row.category,
          similarity: row.similarity,
        });
      }
    }
  }

  // Resolve source titles for display.
  const uniqueSourceIds = Array.from(new Set(chunks.map((c) => c.sourceId)));
  let sources: RagSourceMeta[] = [];
  if (uniqueSourceIds.length) {
    const { data: sourceRows } = await admin
      .from("knowledge_sources")
      .select("id, title")
      .in("id", uniqueSourceIds);
    if (sourceRows) {
      sources = (sourceRows as Array<{ id: string; title: string }>).map(
        (row) => ({ id: row.id, title: row.title })
      );
    }
  }

  return { intent, chunks, sources, facts, qa, embeddingsUnavailable: false };
};

// ---------------------------------------------------------------------------
// System-prompt builder — persona first (so the assistant knows *who* it is
// answering for), then facts, Q&A, and chunked context as labelled sections.
//
// Written for token economy: retrieval metadata the model cannot act on
// (similarity scores, per-item category tags) is deliberately left out, and
// sections use a single short header instead of open/close markers. Only the
// sections that actually have content are emitted.
// ---------------------------------------------------------------------------

export const buildRagSystemPrompt = (
  retrieval: RagRetrieval,
  persona: BusinessPersona = DEFAULT_PERSONA
): string => {
  const { facts, qa, chunks, intent } = retrieval;

  const sections: string[] = [
    buildPersonaIdentity(persona),
    ...buildPersonaLines(persona),
    REPLY_FORMAT_LINE,
    "Source priority: FACTS > Q&A > KB. Never invent business details; if the sources do not cover the question, say so.",
  ];

  if (intent && intent.category !== "general") {
    sections.push(`Topic: ${intent.category}.`);
  }

  // Standing facts — always-on context.
  if (facts.length) {
    sections.push("", "FACTS:");
    facts.forEach((fact) => sections.push(`- ${fact.factText}`));
  }

  // Curated Q&A pairs — high-authority, direct matches.
  if (qa.length) {
    sections.push("", "Q&A:");
    qa.forEach((pair) => sections.push(`Q: ${pair.question}`, `A: ${pair.answer}`));
  }

  // Chunked knowledge — fuzzier, retrieved via vector similarity.
  if (chunks.length) {
    sections.push("", "KB:");
    chunks.forEach((chunk) => sections.push(`- ${chunk.content}`));
  }

  if (!facts.length && !qa.length && !chunks.length) {
    sections.push(
      "",
      "No stored context matched; answer from general knowledge and say so if unsure."
    );
  }

  return sections.join("\n");
};
