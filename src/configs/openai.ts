import "server-only";

import OpenAI from "openai";

/** Metis OpenAI-compatible gateway (Iran). Override with OPENAI_BASE_URL if needed. */
const DEFAULT_BASE_URL = "https://api.metisai.ir/openai/v1";

export const OPENAI_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
] as const;

export const isOpenAIConfigured = (): boolean =>
  Boolean(process.env.OPENAI_API_KEY?.trim());

/**
 * OpenAI SDK client pointed at Metis (`OPENAI_BASE_URL` or Metis default).
 * Call with `openai.chat.completions.create(...)`.
 */
export const getOpenAIClient = (): OpenAI | null => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL,
  });
};
