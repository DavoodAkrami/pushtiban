import "server-only";

import { getOpenAIClient } from "./openai";

/**
 * OpenAI text-embedding-3-small — 1536 dimensions. Cheap and good for RAG.
 * Falls back to `text-embedding-ada-002` (also 1536 dims) if a deploy sets
 * EMBEDDINGS_MODEL explicitly to it.
 */
export const EMBEDDINGS_MODEL =
  process.env.EMBEDDINGS_MODEL?.trim() || "text-embedding-3-small";
export const EMBEDDINGS_DIMENSIONS = 1536;

export const isEmbeddingsConfigured = (): boolean =>
  Boolean(process.env.OPENAI_API_KEY?.trim());

/**
 * Reuses the OpenAI/Metis client for embeddings. The same `OPENAI_API_KEY`
 * that powers chat also exposes the embeddings endpoint via the OpenAI SDK.
 */
export const getEmbeddingsClient = getOpenAIClient;
