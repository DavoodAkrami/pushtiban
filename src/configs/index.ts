import "server-only";

import { isOpenAIConfigured, OPENAI_MODELS } from "./openai";
import { isNvidiaNimConfigured, NVIDIA_NIM_MODELS } from "./nvidia-nim";
import { isOpenRouterConfigured } from "./openrouter";

export type ProviderId = "openai" | "nvidia-nim" | "openrouter";

export { getOpenAIClient, isOpenAIConfigured, OPENAI_MODELS } from "./openai";
export {
  getNvidiaNimClient,
  isNvidiaNimConfigured,
  NVIDIA_NIM_MODELS,
} from "./nvidia-nim";
export {
  getOpenRouterClient,
  isOpenRouterConfigured,
  listOpenRouterFreeModels,
  resolveOpenRouterModel,
  OPENROUTER_FREE_AUTO,
  OPENROUTER_FREE_FALLBACK,
} from "./openrouter";

export {
  EMBEDDINGS_MODEL,
  EMBEDDINGS_DIMENSIONS,
  isEmbeddingsConfigured,
  getEmbeddingsClient,
} from "./embeddings";

export const getConfiguredProviders = (): ProviderId[] => {
  const ids: ProviderId[] = [];
  if (isOpenAIConfigured()) ids.push("openai");
  if (isNvidiaNimConfigured()) ids.push("nvidia-nim");
  if (isOpenRouterConfigured()) ids.push("openrouter");
  return ids;
};

// ---------------------------------------------------------------------------
// Chat-model catalog — the models a site admin may pick for customer replies
// in /dashboard/admin/settings. OpenRouter is excluded: its free model list is
// fetched at runtime and rotates, so it is not a stable choice to persist.
// ---------------------------------------------------------------------------

export type ChatModelChoice = {
  model: string;
  provider: Extract<ProviderId, "openai" | "nvidia-nim">;
  /** False when the provider has no API key in this environment. */
  configured: boolean;
};

export const listChatModelChoices = (): ChatModelChoice[] => [
  ...OPENAI_MODELS.map((model) => ({
    model,
    provider: "openai" as const,
    configured: isOpenAIConfigured(),
  })),
  ...NVIDIA_NIM_MODELS.map((model) => ({
    model,
    provider: "nvidia-nim" as const,
    configured: isNvidiaNimConfigured(),
  })),
];

/**
 * Which provider owns a model id, or null when the model is unknown. Used both
 * to validate the admin's choice and to decide which provider the override
 * applies to.
 */
export const providerForChatModel = (
  model: string
): ChatModelChoice["provider"] | null => {
  const trimmed = model.trim();
  if (!trimmed) return null;
  if ((OPENAI_MODELS as readonly string[]).includes(trimmed)) return "openai";
  if ((NVIDIA_NIM_MODELS as readonly string[]).includes(trimmed)) {
    return "nvidia-nim";
  }
  return null;
};
