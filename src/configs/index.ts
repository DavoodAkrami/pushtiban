import "server-only";

import { isOpenAIConfigured } from "./openai";
import { isNvidiaNimConfigured } from "./nvidia-nim";
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

export const getConfiguredProviders = (): ProviderId[] => {
  const ids: ProviderId[] = [];
  if (isOpenAIConfigured()) ids.push("openai");
  if (isNvidiaNimConfigured()) ids.push("nvidia-nim");
  if (isOpenRouterConfigured()) ids.push("openrouter");
  return ids;
};
