import "server-only";

import OpenAI from "openai";

/**
 * NVIDIA NIM has no official Node SDK — use the OpenAI-compatible API
 * at integrate.api.nvidia.com (same as curl against /v1/chat/completions).
 */
const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

export const NVIDIA_NIM_MODELS = [
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "google/gemma-2-27b-it",
  "microsoft/phi-3-medium-128k-instruct",
] as const;

export const isNvidiaNimConfigured = (): boolean =>
  Boolean(process.env.NVIDIA_NIM_API_KEY?.trim());

/**
 * OpenAI SDK client pointed at NVIDIA NIM.
 * Call with `nvidiaNim.chat.completions.create(...)`.
 */
export const getNvidiaNimClient = (): OpenAI | null => {
  const apiKey = process.env.NVIDIA_NIM_API_KEY?.trim();
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: process.env.NVIDIA_NIM_BASE_URL?.trim() || DEFAULT_BASE_URL,
  });
};
