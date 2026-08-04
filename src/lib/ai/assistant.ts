import "server-only";

import type OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import {
  getNvidiaNimClient,
  getOpenAIClient,
  isNvidiaNimConfigured,
  isOpenAIConfigured,
  providerForChatModel,
} from "@/configs";
import {
  retrieveRagContext,
  buildRagSystemPrompt,
  type RagRetrieval,
} from "@/lib/ai/rag";
import {
  DEFAULT_PERSONA,
  REPLY_FORMAT_LINE,
  buildPersonaIdentity,
  buildPersonaLines,
  getBusinessPersona,
  type BusinessPersona,
} from "@/lib/ai/persona";
import type { ChatTurn } from "@/lib/ai/memory";
import { checkAiLimits, getGlobalAiSettings, logAiUsage } from "@/lib/ai/usage";

const COMPLETION_TIMEOUT_MS = 25_000;
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/**
 * Which channel the reply is going out on.
 *
 * The pipeline itself — persona, retrieval, memory, escalation, gates — is the
 * same everywhere; the channel only decides how long a message may be. Telegram
 * accepts 4096 characters, Instagram 1000, and a reply cut off mid-sentence by
 * the platform is worse than one the model was asked to keep short.
 */
export type AssistantChannel = "telegram" | "instagram";

const CHANNEL_MESSAGE_MAX_LENGTH: Record<AssistantChannel, number> = {
  telegram: 4096,
  instagram: 1000,
};

/** Used when RAG retrieval fails — persona still applies, context does not. */
const buildFallbackSystemPrompt = (
  persona: BusinessPersona,
  options: { continuingSession?: boolean }
): string =>
  [
    buildPersonaIdentity(persona),
    ...buildPersonaLines(persona, options),
    REPLY_FORMAT_LINE,
    "Never invent business details; if you are missing information, say so and ask one focused follow-up question.",
    "You know nothing about the customer — not their name, orders or history — beyond what they say in this conversation. Never guess it.",
  ].join("\n");

/** Truncate by code point, so an emoji is never cut in half. */
const truncate = (value: string, maxLength: number) =>
  Array.from(value).slice(0, maxLength).join("");

type Provider = {
  id: "openai" | "nvidia-nim";
  client: OpenAI | null;
  model: string;
};

const requestCompletion = async ({
  client,
  maxLength,
  messages,
  model,
  usage,
}: {
  client: OpenAI;
  maxLength: number;
  messages: ChatCompletionMessageParam[];
  model: string;
  usage?: { userId: string; provider: string };
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages,
        max_tokens: 700,
        stream: false,
      },
      { signal: controller.signal }
    );
    if (usage) {
      void logAiUsage({
        userId: usage.userId,
        kind: "chat",
        provider: usage.provider,
        model,
        usage: completion.usage,
      });
    }
    const content = completion.choices[0]?.message?.content?.trim();
    return content ? truncate(content, maxLength) : null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Completion with the `escalate_to_admin` tool. When the model calls the
 * tool, we return `{ text: <preface or null>, needsHuman: true }` so the
 * webhook can route the customer to a human. When the model replies normally
 * (no tool call), we return the text with `needsHuman: false`.
 *
 * Falls back to `null` (caller handles) when the response shape is unexpected.
 */
const requestCompletionWithEscalation = async ({
  client,
  maxLength,
  messages,
  model,
  usage,
}: {
  client: OpenAI;
  maxLength: number;
  messages: ChatCompletionMessageParam[];
  model: string;
  usage?: { userId: string; provider: string };
}): Promise<AssistantResult | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages,
        tools: [ESCALATE_TOOL],
        tool_choice: "auto",
        max_tokens: 700,
        stream: false,
      },
      { signal: controller.signal }
    );

    if (usage) {
      void logAiUsage({
        userId: usage.userId,
        kind: "chat",
        provider: usage.provider,
        model,
        usage: completion.usage,
      });
    }

    const choice = completion.choices[0];
    if (!choice) return null;

    // Did the model call the escalation tool?
    const toolCalls = choice.message.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const functionCalls = toolCalls.filter(
        (call): call is ChatCompletionMessageFunctionToolCall =>
          call.type === "function"
      );
      const escalateCall = functionCalls.find(
        (call) => call.function?.name === "escalate_to_admin"
      );
      if (escalateCall) {
        let preface: string | null = null;
        try {
          const args = JSON.parse(escalateCall.function?.arguments ?? "{}");
          if (typeof args.preface === "string" && args.preface.trim()) {
            preface = truncate(args.preface.trim(), maxLength);
          }
        } catch {
          // Ignore malformed JSON — preface is optional.
        }
        return { text: preface, needsHuman: true };
      }
    }

    const content = choice.message.content?.trim();
    if (content) return { text: truncate(content, maxLength), needsHuman: false };
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const isAssistantAiConfigured = () =>
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
 * Result of generateAssistantReply. When `needsHuman` is true the caller
 * (a channel webhook) should offer the customer a "do you want me to ask the
 * admin?" choice instead of just sending `text` — inline buttons on Telegram,
 * quick-reply chips on Instagram. When false, `text` is the final reply to send.
 */
export type AssistantResult = {
  text: string | null;
  needsHuman: boolean;
  /**
   * What retrieval found for this message. The channel webhooks ignore it — it
   * is here so the dashboard preview can show the owner exactly which facts,
   * Q&A pairs and chunks fed the answer, without paying for a second retrieval.
   */
  retrieval?: RagRetrieval | null;
};

/**
 * Generate an AI reply for a customer message, on any channel.
 *
 * When `userId` is provided (the business owner whose bot or Instagram account
 * received the message), the full pipeline runs: the owner's persona (business
 * name, category, intro, instructions, style levels) plus intent detection →
 * standing business facts → curated Q&A → filtered vector chunks → augmented
 * system prompt. This is the production path used by the Telegram webhook and
 * the Instagram webhook alike — `options.channel` changes only the length the
 * reply is trimmed to, never what the model is told or shown.
 *
 * When `userId` is omitted, falls back to a plain LLM reply with no retrieval
 * and no persona.
 *
 * `options.history` is the chat's short-term memory (src/lib/ai/memory.ts):
 * the recent turns of an open session, sent as real chat messages. When it is
 * non-empty the assistant is told not to introduce itself again, and the
 * customer's previous message is handed to the intent classifier so follow-ups
 * ("و برای دو تا؟") condense into a searchable query.
 *
 * Returns `{ text, needsHuman }`. When `options.handoffEnabled` is not false
 * the AI is given an `escalate_to_admin` tool: it calls the tool when it
 * genuinely cannot answer using the knowledge base, OR when the customer
 * explicitly asks to involve an admin/owner/human. When `needsHuman` is true
 * the webhook should offer the customer a "ask admin?" choice instead of
 * sending `text`. When `false`, `text` is the final reply to send.
 *
 * Passing `handoffEnabled: false` (the owner turned handoff off) omits the
 * tool and its instructions entirely — the escalation path is unreachable in
 * that configuration, so paying its input tokens on every message is waste.
 *
 * Errors during retrieval are non-fatal: we fall back to a persona-only
 * prompt so the customer still gets a reply.
 */
const ESCALATE_TOOL = {
  type: "function" as const,
  function: {
    name: "escalate_to_admin",
    description:
      "Route the customer to a human admin/owner for support. Call this ONLY when you cannot confidently answer the customer's question using the provided business knowledge, or when the customer explicitly asks to speak with an admin, owner, operator, or human.",
    parameters: {
      type: "object",
      properties: {
        preface: {
          type: "string",
          description:
            "An optional short Persian message to show the customer before the 'send to admin?' prompt (e.g. an apology or summary of the question). Keep it under 2 sentences.",
        },
      },
      required: [],
    },
  },
};

const buildEscalationSystemPrompt = (basePrompt: string): string =>
  `${basePrompt}\nCall \`escalate_to_admin\` ONLY when the customer asks to reach a human/admin, or when you genuinely cannot answer (put a one-line apology in \`preface\`). Never call it for questions you can answer, greetings, or small talk.`;

export const generateAssistantReply = async (
  question: string,
  userId?: string,
  options: {
    channel?: AssistantChannel;
    handoffEnabled?: boolean;
    history?: ChatTurn[];
  } = {}
): Promise<AssistantResult> => {
  const maxLength = CHANNEL_MESSAGE_MAX_LENGTH[options.channel ?? "telegram"];

  // Chat memory (src/lib/ai/memory.ts). A non-empty history means the customer
  // is mid-session: the assistant must not re-introduce itself, and the
  // previous message helps the intent call resolve follow-ups.
  const history = options.history ?? [];
  const continuingSession = history.length > 0;
  const previousUserMessage = [...history]
    .reverse()
    .find((turn) => turn.role === "user")?.text;

  // When the owner has human handoff switched off, the escalation tool can
  // never lead anywhere — the webhook replies "I don't know" either way. Not
  // sending the tool schema or its instructions saves those input tokens on
  // every single message.
  const escalationAvailable = options.handoffEnabled !== false;

  // Platform-wide kill switch and per-business monthly caps, both managed
  // from /dashboard/admin. When either gate rejects the call, no LLM request
  // is made — the webhook sends its generic "AI unavailable" fallback.
  const settings = await getGlobalAiSettings();
  if (!settings.aiEnabled) return { text: null, needsHuman: false };
  if (userId) {
    const limits = await checkAiLimits(userId);
    if (!limits.allowed) {
      console.warn(`AI reply blocked for ${userId}: ${limits.reason}`);
      return { text: null, needsHuman: false };
    }
  }

  // Business identity + owner-authored persona. Retrieval and the persona are
  // independent, so they run together; a persona read never throws.
  const [persona, retrieval] = await Promise.all([
    userId ? getBusinessPersona(userId) : Promise.resolve(DEFAULT_PERSONA),
    userId
      ? retrieveRagContext({
          question,
          userId,
          previousUserMessage,
        }).catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message.slice(0, 200)
              : "Unknown error";
          console.error(
            "Assistant RAG retrieval failed; using fallback:",
            message
          );
          return null;
        })
      : Promise.resolve(null),
  ]);

  let systemPrompt = retrieval
    ? buildRagSystemPrompt(retrieval, persona, { continuingSession })
    : buildFallbackSystemPrompt(persona, { continuingSession });

  if (escalationAvailable) {
    systemPrompt = buildEscalationSystemPrompt(systemPrompt);
  }

  // The session's recent turns sit between the system prompt and the new
  // question, so the model reads them as what they are: earlier messages.
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user", content: question },
  ];

  // The site admin can pin one chat model in /dashboard/admin/settings. It
  // overrides the env var for whichever provider owns that model id, and that
  // provider is tried first; the other stays in the list as a fallback.
  const pinnedModel = settings.chatModel.trim();
  const pinnedProvider = providerForChatModel(pinnedModel);

  const providers: Provider[] = [
    {
      id: "openai",
      client: getOpenAIClient(),
      model:
        pinnedProvider === "openai"
          ? pinnedModel
          : process.env.TELEGRAM_AI_OPENAI_MODEL?.trim() ||
            DEFAULT_OPENAI_MODEL,
    },
    {
      id: "nvidia-nim",
      client: getNvidiaNimClient(),
      model:
        pinnedProvider === "nvidia-nim"
          ? pinnedModel
          : process.env.TELEGRAM_AI_NVIDIA_MODEL?.trim() ||
            DEFAULT_NVIDIA_MODEL,
    },
  ];
  if (pinnedProvider) {
    providers.sort((a, b) =>
      a.id === pinnedProvider ? -1 : b.id === pinnedProvider ? 1 : 0
    );
  }

  for (const provider of providers) {
    if (!provider.client) continue;

    const usage = userId ? { userId, provider: provider.id } : undefined;

    // Handoff off → no tool, no tool-call parsing, no retry path.
    if (!escalationAvailable) {
      try {
        const text = await requestCompletion({
          client: provider.client,
          maxLength,
          messages,
          model: provider.model,
          usage,
        });
        if (text) return { text, needsHuman: false, retrieval };
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
        console.error(`AI provider ${provider.id} failed:`, message);
      }
      continue;
    }

    let result: AssistantResult | null = null;
    try {
      result = await requestCompletionWithEscalation({
        client: provider.client,
        maxLength,
        messages,
        model: provider.model,
        usage,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
      console.error(
        `AI provider ${provider.id} failed with tools:`,
        message
      );
      // Some models reject the `tools` parameter entirely. Retry the same
      // provider without tools so the customer still gets a text reply.
      try {
        const text = await requestCompletion({
          client: provider.client,
          maxLength,
          messages,
          model: provider.model,
          usage,
        });
        if (text) return { text, needsHuman: false, retrieval };
      } catch {
        // fall through to the next provider
      }
    }
    if (result) return { ...result, retrieval };
  }

  // No provider succeeded — signal that a human should step in.
  return { text: null, needsHuman: true, retrieval };
};
