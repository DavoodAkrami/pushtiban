import "server-only";

import {
  EMBEDDINGS_DIMENSIONS,
  EMBEDDINGS_MODEL,
  getEmbeddingsClient,
} from "@/configs";

/** Maximum characters per chunk — keeps embeddings focused and token-friendly. */
export const CHUNK_SIZE = 1200;
/** Character overlap between consecutive chunks so context is not cut mid-sentence. */
export const CHUNK_OVERLAP = 200;

type EmbeddingResponse = {
  data: Array<{ embedding?: number[] }>;
};

/**
 * Split a long text into overlapping chunks of roughly CHUNK_SIZE characters,
 * breaking on paragraph / sentence boundaries when possible.
 */
export const splitIntoChunks = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);

    // Try to break on a paragraph or sentence boundary inside the window.
    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const lastParagraph = slice.lastIndexOf("\n\n");
      const lastSentence = slice.lastIndexOf(". ");
      const boundary =
        lastParagraph > CHUNK_SIZE * 0.4
          ? lastParagraph
          : lastSentence > CHUNK_SIZE * 0.4
            ? lastSentence
            : -1;
      if (boundary !== -1) end = start + boundary + 1;
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    // Step forward, leaving the overlap window.
    const consumed = end - start;
    start = end;
    if (end >= normalized.length) break;
    // Guard against zero progress loops.
    if (consumed <= CHUNK_OVERLAP) start += CHUNK_OVERLAP - consumed + 1;
  }

  return chunks;
};

/**
 * Generate an embedding vector for a single text input.
 * Returns null if the embeddings provider is not configured.
 */
export const embedQuery = async (text: string): Promise<number[] | null> => {
  const client = getEmbeddingsClient();
  if (!client) return null;

  const response = (await client.embeddings.create({
    model: EMBEDDINGS_MODEL,
    input: text,
    dimensions: EMBEDDINGS_DIMENSIONS,
  })) as unknown as EmbeddingResponse;

  return response.data?.[0]?.embedding ?? null;
};

/**
 * Generate embeddings for a batch of text chunks. OpenAI supports batching
 * up to 2048 inputs per request; we keep it conservative.
 */
export const embedChunks = async (
  chunks: string[]
): Promise<number[][] | null> => {
  if (!chunks.length) return [];
  const client = getEmbeddingsClient();
  if (!client) return null;

  const response = (await client.embeddings.create({
    model: EMBEDDINGS_MODEL,
    input: chunks,
    dimensions: EMBEDDINGS_DIMENSIONS,
  })) as unknown as EmbeddingResponse;

  return (response.data ?? []).map((entry) => entry.embedding ?? []);
};
