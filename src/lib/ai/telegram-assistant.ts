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
 * Result of generateTelegramAiReply. When `needsHuman` is true the caller
 * (webhook) should offer the customer a "do you want me to ask the admin?"
 * inline button instead of just sending `text`. When false, `text` is the
 * final reply to send.
 */
export type TelegramAiResult = {
  text: string | null;
  needsHuman: boolean;
};

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
 * Returns `{ text, needsHuman }`. When the RAG retrieval found no context at
 * all (no facts, no Q&A, no chunks) the system prompt instructs the model to
 * prepend the literal marker `[NEEDS_HUMAN]` to its reply; we strip it and set
 * `needsHuman: true` so the webhook can offer the "ask admin?" button.
 *
 * Errors during retrieval are non-fatal: we fall back to the plain
 * FALLBACK_SYSTEM_PROMPT so the customer still gets a reply.
 */
export const generateTelegramAiReply = async (
  question: string,
  userId?: string
): Promise<TelegramAiResult> => {
  // Try to build a RAG-augmented system prompt scoped to this owner's
  // knowledge base. Any failure → fall back to the plain prompt below.
  let systemPrompt = FALLBACK_SYSTEM_PROMPT;
  let hadRagContext = false;
  if (userId) {
    try {
      const retrieval = await retrieveRagContext({
        question,
        userId,
        matchCount: 4,
        minSimilarity: 0.2,
      });
      hadRagContext =
        retrieval.facts.length > 0 ||
        retrieval.qa.length > 0 ||
        retrieval.chunks.length > 0;
      systemPrompt = buildRagSystemPrompt(retrieval);
      // When we have no RAG context at all, instruct the model to mark the
      // reply with [NEEDS_HUMAN] so the webhook can offer the "ask admin?"
      // button instead of sending a guess.
      if (!hadRagContext) {
        systemPrompt +=
          "\n\nIMPORTANT: No knowledge-base context was retrieved for this question. If you are not confident about the answer, start your reply with the exact marker [NEEDS_HUMAN] (the system will strip it and offer to escalate to a human). Do not invent business facts.";
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
      console.error("Telegram RAG retrieval failed; using fallback:", message);
    }
  }

  // Deterministic escalation: when no RAG context was found at all, do NOT
  // call the LLM (it would either hallucinate or narrate its own failure).
  // Short-circuit with a fixed preface + needsHuman so the webhook offers
  // the "ask admin?" button directly.
  if (userId && !hadRagContext) {
    return { text: null, needsHuman: true };
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
      if (reply) {
        // Detect the [NEEDS_HUMAN] marker the model may have prepended.
        if (reply.startsWith("[NEEDS_HUMAN]")) {
          const cleaned = reply.slice("[NEEDS_HUMAN]".length).trim();
          return {
            text: cleaned || null,
            needsHuman: true,
          };
        }
        return { text: reply, needsHuman: false };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
      console.error(`Telegram AI provider ${provider.id} failed:`, message);
    }
  }

  // No provider succeeded — signal that a human should step in.
  return { text: null, needsHuman: true };
};
