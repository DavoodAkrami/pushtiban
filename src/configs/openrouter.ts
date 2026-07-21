import "server-only";

import { OpenRouter } from "@openrouter/sdk";

/** Free Models Router — picks a free model that can answer now. */
export const OPENROUTER_FREE_AUTO = "openrouter/free";

export const OPENROUTER_FREE_FALLBACK = [
  OPENROUTER_FREE_AUTO,
  "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-2-9b-it:free",
  "mistralai/mistral-7b-instruct:free",
  "qwen/qwen-2.5-7b-instruct:free",
  "microsoft/phi-3-mini-128k-instruct:free",
] as const;

export const isOpenRouterConfigured = (): boolean =>
  Boolean(process.env.OPENROUTER_API_KEY?.trim());

/**
 * Official OpenRouter TypeScript SDK.
 * Call with `openRouter.chat.send({ chatRequest: { model, messages, stream } })`.
 */
export const getOpenRouterClient = (): OpenRouter | null => {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const serverURL = process.env.OPENROUTER_BASE_URL?.trim();

  return new OpenRouter({
    apiKey,
    httpReferer: process.env.NEXT_PUBLIC_SITE_URL || "https://pushtiban.ir",
    appTitle: "Pushtiban",
    ...(serverURL ? { serverURL } : {}),
  });
};

export const resolveOpenRouterModel = (model: string): string =>
  model === "openrouter/auto" || model === "auto"
    ? OPENROUTER_FREE_AUTO
    : model;

/** List free (or zero-price) chat models; falls back to a static list on error. */
export const listOpenRouterFreeModels = async (): Promise<string[]> => {
  const client = getOpenRouterClient();
  if (!client) return [...OPENROUTER_FREE_FALLBACK];

  try {
    const page = await client.models.list({
      maxPrice: 0,
      limit: 30,
    });
    const freeModels = page.result.data
      .map((m) => m.id)
      .filter((id) => id !== OPENROUTER_FREE_AUTO);

    return freeModels.length > 0
      ? [OPENROUTER_FREE_AUTO, ...freeModels]
      : [...OPENROUTER_FREE_FALLBACK];
  } catch {
    return [...OPENROUTER_FREE_FALLBACK];
  }
};
