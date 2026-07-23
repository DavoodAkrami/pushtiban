import "server-only";

import type OpenAI from "openai";
import {
  getNvidiaNimClient,
  getOpenAIClient,
  isNvidiaNimConfigured,
  isOpenAIConfigured,
} from "@/configs";
import {
  retrieveRagContext,
  buildRagSystemPrompt,
} from "@/lib/ai/rag";

const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;
const COMPLETION_TIMEOUT_MS = 25_000;
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const FALLBACK_SYSTEM_PROMPT = [
  "You are the customer-support assistant for a business using Pushtiban.",
  "Answer the user's question clearly and concisely in the same language as the user.",
  "Do not invent business-specific facts. If necessary information is missing, say so and ask one focused follow-up question.",
  "Return plain text suitable for a Telegram message.",
].join(" ");

const truncateTelegramMessage = (value: string) =>
  Array.from(value).slice(0, TELEGRAM_MESSAGE_MAX_LENGTH).join("");

type Provider = {
  id: "openai" | "nvidia-nim";
  client: OpenAI | null;
  model: string;
};

const requestCompletion = async ({
  client,
  model,
  question,
  systemPrompt,
}: {
  client: OpenAI;
  model: string;
  question: string;
  systemPrompt: string;
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        max_tokens: 700,
        stream: false,
      },
      { signal: controller.signal }
    );
    const content = completion.choices[0]?.message?.content?.trim();
    return content ? truncateTelegramMessage(content) : null;
  } finally {
    clearTimeout(timeout);
  }
};

export const isTelegramAiConfigured = () =>
  isNvidiaNimConfigured() || isOpenAIConfigured();

/**
 * Generate an AI reply for a Telegram user message.
 *
 * When `userId` is provided (the business owner whose bot received the
 * message), the full RAG pipeline runs: intent detection → standing business
 * facts → curated Q&A → filtered vector chunks → augmented system prompt. This
 * is the production path used by the Telegram webhook.
 *
 * When `userId` is omitted, falls back to a plain LLM reply with no retrieval
 * (kept for any legacy callers; the webhook now always passes a userId).
 *
 * Errors during retrieval are non-fatal: we fall back to the plain
 * FALLBACK_SYSTEM_PROMPT so the customer still gets a reply.
 */
export const generateTelegramAiReply = async (
  question: string,
  userId?: string
) => {
  // Try to build a RAG-augmented system prompt scoped to this owner's
  // knowledge base. Any failure → fall back to the plain prompt below.
  let systemPrompt = FALLBACK_SYSTEM_PROMPT;
  if (userId) {
    try {
      const retrieval = await retrieveRagContext({
        question,
        userId,
        matchCount: 4,
        minSimilarity: 0.2,
      });
      systemPrompt = buildRagSystemPrompt(retrieval);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
      console.error("Telegram RAG retrieval failed; using fallback:", message);
    }
  }

  const providers: Provider[] = [
    {
      id: "openai",
      client: getOpenAIClient(),
      model: process.env.TELEGRAM_AI_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    },
    {
      id: "nvidia-nim",
      client: getNvidiaNimClient(),
      model:
        process.env.TELEGRAM_AI_NVIDIA_MODEL?.trim() || DEFAULT_NVIDIA_MODEL,
    },
  ];

  for (const provider of providers) {
    if (!provider.client) continue;

    try {
      const reply = await requestCompletion({
        client: provider.client,
        model: provider.model,
        question,
        systemPrompt,
      });
      if (reply) return reply;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
      console.error(`Telegram AI provider ${provider.id} failed:`, message);
    }
  }

  return null;
};
