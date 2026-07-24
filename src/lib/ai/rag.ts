import "server-only";

import { embedQuery } from "@/lib/ai/embeddings";
import {
  getOpenAIClient,
  getNvidiaNimClient,
  isEmbeddingsConfigured,
} from "@/configs";
import { createAdminClient } from "@/lib/supabase/admin";

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
// into one of a fixed set of categories. Returns null if no provider is
// available (caller falls back to unfiltered retrieval).
// ---------------------------------------------------------------------------

const INTENT_SYSTEM_PROMPT = [
  "You classify a customer-support question into exactly one category.",
  'Respond with a JSON object: {"category": "<one of: shipping, pricing, products, returns, account, general>", "confidence": <0..1>}.',
  "Use \"general\" if the question is small-talk, ambiguous, or doesn't fit any category.",
  "Return JSON only — no prose, no code fences.",
].join(" ");

const INTENT_TIMEOUT_MS = 8_000;

const requestIntent = async (
  client: NonNullable<ReturnType<typeof getOpenAIClient>>,
  question: string
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
    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as { category?: string; confidence?: number };
    const category = typeof parsed.category === "string" ? parsed.category : "general";
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    return { category, confidence };
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
export const extractIntent = async (question: string): Promise<RagIntent | null> => {
  // Prefer OpenAI (cheap, fast), fall back to NVIDIA NIM.
  const openai = getOpenAIClient();
  if (openai) return requestIntent(openai, question);

  const nvidia = getNvidiaNimClient();
  if (nvidia) return requestIntent(nvidia, question);

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
  matchCount = 4,
  minSimilarity = 0.2,
}: {
  question: string;
  userId: string;
  matchCount?: number;
  minSimilarity?: number;
}): Promise<RagRetrieval> => {
  const admin = createAdminClient();

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

  // 3. Intent classification and the query embedding are independent, so run
  //    them concurrently. Intent falls back to null gracefully on any error.
  const [intent, queryEmbedding] = await Promise.all([
    extractIntent(question),
    embedQuery(question),
  ]);
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

  // Only filter when confidence is meaningful; otherwise search everything.
  const categoryFilter =
    intent && intent.confidence >= 0.4 && intent.category !== "general"
      ? intent.category
      : null;

  // 3. Q&A pair matching (strict — only surface very close matches).
  const qa: RagQa[] = [];
  {
    const { data: qaRows } = await admin.rpc("match_knowledge_qa", {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      filter_category: categoryFilter,
      match_count: 2,
      min_similarity: 0.6,
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
        match_count: matchCount,
        filter_category: categoryFilter,
        filter_source_id: null,
        min_similarity: minSimilarity,
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
// System-prompt builder — injects facts, Q&A, and chunked context as
// structured sections so the LLM knows what each piece is.
// ---------------------------------------------------------------------------

export const buildRagSystemPrompt = (retrieval: RagRetrieval): string => {
  const { facts, qa, chunks, intent } = retrieval;

  const sections: string[] = [
    "You are the customer-support assistant for a business using Pushtiban.",
    "Answer the user's question clearly and concisely in the same language as the user.",
    "Prioritize the sources below in this order: standing facts > curated Q&A > knowledge-base chunks.",
    "If none of the sources answer the question, say so plainly and do not invent facts.",
    "Return plain text suitable for a Telegram message.",
  ];

  if (intent && intent.category !== "general") {
    sections.push(`The user's question appears to be about: ${intent.category}.`);
  }

  // Standing facts — always-on context.
  if (facts.length) {
    sections.push("", "=== FACTS (always known) ===");
    facts.forEach((fact, i) => {
      sections.push(`[F${i + 1}] (${fact.category}) ${fact.factText}`);
    });
    sections.push("=== END FACTS ===");
  }

  // Curated Q&A pairs — high-authority, direct matches.
  if (qa.length) {
    sections.push("", "=== CURATED Q&A ===");
    qa.forEach((pair, i) => {
      sections.push(
        `[Q${i + 1}] (similarity ${pair.similarity.toFixed(3)})`,
        `Q: ${pair.question}`,
        `A: ${pair.answer}`
      );
    });
    sections.push("=== END Q&A ===");
  }

  // Chunked knowledge — fuzzier, retrieved via vector similarity.
  if (chunks.length) {
    sections.push("", "=== KNOWLEDGE BASE ===");
    chunks.forEach((chunk, i) => {
      sections.push(
        `[${i + 1}] (${chunk.category}, similarity ${chunk.similarity.toFixed(3)})\n${chunk.content}`
      );
    });
    sections.push("=== END KNOWLEDGE BASE ===");
  }

  if (!facts.length && !qa.length && !chunks.length) {
    sections.push(
      "",
      "No knowledge-base context was retrieved; answer from general knowledge, but say so if you are unsure."
    );
  }

  return sections.join("\n");
};
