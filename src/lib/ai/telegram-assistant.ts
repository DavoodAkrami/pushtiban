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

// ---------------------------------------------------------------------------
// Explicit "connect me to a human" detection — zero-token, deterministic.
// Used by the webhook to route a customer who directly asks for a human to the
// handoff flow (subject to the owner's handoff setting), without spending an
// LLM completion.
// ---------------------------------------------------------------------------

/** Normalize Persian/Arabic variants + zero-width joiners for phrase matching. */
const normalizePersian = (value: string) =>
  value
    .toLowerCase()
    .replace(/‌/g, " ") // ZWNJ → space so "پشتیبانی" ≈ "پشتیبان ی" boundaries relax
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\s+/g, " ")
    .trim();

// Curated request phrases. Each requires a connective or a human-support noun
// so the brand word "پشتیبان" alone (which the bot itself uses) does not fire.
const HUMAN_REQUEST_PHRASES = [
  "با پشتیبان",
  "به پشتیبان",
  "پشتیبان انسانی",
  "پشتیبانی انسانی",
  "با ادمین",
  "به ادمین",
  "با اپراتور",
  "به اپراتور",
  "با کارشناس",
  "به کارشناس",
  "با انسان",
  "به انسان",
  "انسان واقعی",
  "با مدیر",
  "به مدیر",
  "با یکی صحبت",
  "با یک نفر صحبت",
].map(normalizePersian);

/**
 * Returns true when the customer's message is an explicit request to be
 * connected to a human / admin / operator (as opposed to a normal question).
 */
export const customerRequestedHuman = (text: string): boolean => {
  const normalized = normalizePersian(text);
  if (!normalized) return false;
  return HUMAN_REQUEST_PHRASES.some((phrase) => normalized.includes(phrase));
};

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
 * Returns `{ text, needsHuman }`. Escalation is deterministic: when the RAG
 * retrieval found no context at all (no facts, no Q&A, no chunks) we do NOT
 * call the LLM and return `{ text: null, needsHuman: true }` so the webhook can
 * decide whether to escalate to a human (subject to the owner's handoff
 * setting). This avoids paying for a completion that would only hallucinate or
 * narrate its own failure.
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
      console.error("Telegram RAG retrieval failed; using fallback:", message);
    }
  }

  // Deterministic escalation: when no RAG context was found at all, short-circuit
  // with needsHuman so the webhook can offer the "ask admin?" button directly
  // (no LLM call).
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
