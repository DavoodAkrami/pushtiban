import "server-only";

import type OpenAI from "openai";
import {
  getNvidiaNimClient,
  getOpenAIClient,
  isNvidiaNimConfigured,
  isOpenAIConfigured,
} from "@/configs";

const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;
const COMPLETION_TIMEOUT_MS = 25_000;
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = [
  "You are the customer-support assistant for a business using Pushtiban.",
  "Answer the user's question clearly and concisely in the same language as the user.",
  "Do not invent business-specific facts. If necessary information is missing, say so and ask one focused follow-up question.",
  "Return plain text suitable for a Telegram message.",
].join(" ");

const truncateTelegramMessage = (value: string) =>
  Array.from(value).slice(0, TELEGRAM_MESSAGE_MAX_LENGTH).join("");

const requestCompletion = async ({
  client,
  model,
  question,
}: {
  client: OpenAI;
  model: string;
  question: string;
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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

export const generateTelegramAiReply = async (question: string) => {
  const providers = [
    {
      id: "nvidia-nim",
      client: getNvidiaNimClient(),
      model:
        process.env.TELEGRAM_AI_NVIDIA_MODEL?.trim() || DEFAULT_NVIDIA_MODEL,
    },
    {
      id: "openai",
      client: getOpenAIClient(),
      model: process.env.TELEGRAM_AI_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    },
  ] as const;

  for (const provider of providers) {
    if (!provider.client) continue;

    try {
      const reply = await requestCompletion({
        client: provider.client,
        model: provider.model,
        question,
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
