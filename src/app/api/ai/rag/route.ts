import { NextRequest, NextResponse } from "next/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  getOpenAIClient,
  getNvidiaNimClient,
  getOpenRouterClient,
  resolveOpenRouterModel,
  type ProviderId,
} from "@/configs";
import { retrieveRagContext, buildRagSystemPrompt } from "@/lib/ai/rag";
import { getBusinessPersona } from "@/lib/ai/persona";
import { logAiUsage, type UsageTokens } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type RagRequestBody = {
  provider: ProviderId;
  model: string;
  question: string;
  matchCount?: number;
  minSimilarity?: number;
  /** Optional: restrict chunk retrieval to a single knowledge source. */
  sourceId?: string | null;
};

/**
 * Format a provider/SSE error as a short, safe string. Never log raw SDK
 * errors (they may hold Response objects with HTML bodies).
 */
const formatProviderError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? error : "RAG chat request failed";
  }
  let message = error.message || error.name || "RAG chat request failed";
  if (/<html[\s>]/i.test(message) || /403 Forbidden/i.test(message)) {
    const code = message.match(/\b(401|403|429|500|502|503)\b/)?.[1];
    message = code ? `Provider returned HTTP ${code}` : "Provider request was forbidden";
  }
  const nested = (
    error as { body?: { error?: { message?: string } }; error?: string }
  ).body?.error?.message;
  if (nested && typeof nested === "string") message = nested;
  return message.slice(0, 500);
};

const toSseStream = (
  iterate: (enqueue: (payload: Record<string, unknown>) => void) => Promise<void>
) => {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start: async (controller) => {
      const enqueue = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        await iterate(enqueue);
      } catch (error) {
        enqueue({ error: formatProviderError(error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};

export const POST = async (request: NextRequest) => {
  try {
    const body = (await request.json()) as RagRequestBody;
    const {
      provider: providerId,
      model,
      question,
      matchCount,
    } = body;

    if (!providerId || !model || !question?.trim()) {
      return NextResponse.json(
        { error: "provider, model, and question are required" },
        { status: 400 }
      );
    }

    // Hard cap on how many chunks the AI can pull from Supabase, regardless of
    // what the client asks for. Keeps token usage bounded: 10 chunks * ~300
    // tokens each = ~3k tokens of context max. The AI never controls this —
    // the server enforces it.
    const requestedMatchCount = Number(matchCount ?? 4);
    const clampedMatchCount = Number.isFinite(requestedMatchCount)
      ? Math.min(Math.max(1, Math.floor(requestedMatchCount)), 10)
      : 4;
    const requestedMinSimilarity = Number(
      (body as { minSimilarity?: unknown }).minSimilarity ?? 0.35
    );
    const clampedMinSimilarity = Number.isFinite(requestedMinSimilarity)
      ? Math.min(Math.max(0, requestedMinSimilarity), 1)
      : 0.35;
    const sourceId =
      typeof body.sourceId === "string" && body.sourceId.trim()
        ? body.sourceId.trim()
        : null;

    // Authenticate the request; RAG retrieval is scoped to the signed-in user.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "نشست شما تمام شده؛ دوباره وارد شوید." }, { status: 401 });
    }

    // Run the full RAG pipeline: intent → facts + Q&A + filtered vector chunks.
    const retrieval = await retrieveRagContext({
      question,
      userId: user.id,
      matchCount: clampedMatchCount,
      minSimilarity: clampedMinSimilarity,
      sourceId,
    }).catch((error) => {
      const code = (error as { code?: string }).code;
      const setupRequired = SETUP_ERROR_CODES.has(code ?? "");
      throw Object.assign(
        new Error(
          setupRequired
            ? "راه‌اندازی RAG کامل نشده؛ اسکریپت‌های rag.sql و knowledge.sql را اجرا کنید."
            : "جستجوی پایگاه دانش ناموفق بود."
        ),
        { setupRequired }
      );
    });

    const persona = await getBusinessPersona(user.id);
    const systemPrompt = buildRagSystemPrompt(retrieval, persona);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ];

    // For OpenAI-compatible providers we send ChatCompletionMessageParam[].
    const openaiMessages = messages as ChatCompletionMessageParam[];

    // The retrieved context is emitted to the client as the first SSE event,
    // so the playground UI can display what the AI fetched (intent, facts,
    // Q&A, chunks) before the streamed answer.
    const prefix = async (enqueue: (payload: Record<string, unknown>) => void) => {
      enqueue({
        rag: {
          intent: retrieval.intent,
          chunks: retrieval.chunks,
          sources: retrieval.sources,
          facts: retrieval.facts,
          qa: retrieval.qa,
          embeddingsUnavailable: retrieval.embeddingsUnavailable,
        },
      });
    };

    switch (providerId) {
      case "openai": {
        const client = getOpenAIClient();
        if (!client) {
          return NextResponse.json({ error: "Provider openai not configured" }, { status: 400 });
        }
        const max_tokens = 1024;
        const completion = await client.chat.completions.create({
          model,
          messages: openaiMessages,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens,
        });
        return toSseStream(async (enqueue) => {
          await prefix(enqueue);
          let usage: UsageTokens | null = null;
          let done = false;
          for await (const chunk of completion) {
            if (chunk.usage) usage = chunk.usage;
            const content = chunk.choices?.[0]?.delta?.content ?? "";
            if (content) enqueue({ content });
            if (!done && chunk.choices?.[0]?.finish_reason) {
              enqueue({ done: true, model: chunk.model ?? model });
              done = true;
              // Keep iterating — the usage-only chunk arrives after the
              // finish_reason when include_usage is on.
            }
          }
          void logAiUsage({
            userId: user.id,
            kind: "chat",
            provider: "openai",
            model,
            usage,
          });
        });
      }
      case "nvidia-nim": {
        const client = getNvidiaNimClient();
        if (!client) {
          return NextResponse.json({ error: "Provider nvidia-nim not configured" }, { status: 400 });
        }
        const max_tokens = 1024;
        const completion = await client.chat.completions.create({
          model,
          messages: openaiMessages,
          stream: true,
          max_tokens,
        });
        return toSseStream(async (enqueue) => {
          await prefix(enqueue);
          let usage: UsageTokens | null = null;
          for await (const chunk of completion) {
            if (chunk.usage) usage = chunk.usage;
            const content = chunk.choices?.[0]?.delta?.content ?? "";
            if (content) enqueue({ content });
            if (chunk.choices?.[0]?.finish_reason) {
              enqueue({ done: true, model: chunk.model ?? model });
              break;
            }
          }
          void logAiUsage({
            userId: user.id,
            kind: "chat",
            provider: "nvidia-nim",
            model,
            usage,
          });
        });
      }
      case "openrouter": {
        const client = getOpenRouterClient();
        if (!client) {
          return NextResponse.json({ error: "Provider openrouter not configured" }, { status: 400 });
        }
        const resolvedModel = resolveOpenRouterModel(model);
        const completion = (await client.chat.send({
          chatRequest: { model: resolvedModel, messages, stream: true, maxTokens: 1024 },
        })) as AsyncIterable<{
          model?: string;
          choices?: Array<{ finishReason?: string | null; delta?: { content?: string | null } }>;
        }>;
        return toSseStream(async (enqueue) => {
          await prefix(enqueue);
          for await (const chunk of completion) {
            const content = chunk.choices?.[0]?.delta?.content ?? "";
            if (content) enqueue({ content });
            if (chunk.choices?.[0]?.finishReason) {
              enqueue({ done: true, model: chunk.model ?? resolvedModel });
              break;
            }
          }
          // OpenRouter's stream does not surface token usage; log the call
          // anyway (0 tokens) so per-business message counts stay accurate.
          void logAiUsage({
            userId: user.id,
            kind: "chat",
            provider: "openrouter",
            model: resolvedModel,
            usage: null,
          });
        });
      }
      default:
        return NextResponse.json(
          { error: `Unknown provider: ${providerId as string}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = formatProviderError(error);
    console.error("RAG chat API error:", message);
    const setupRequired = (error as { setupRequired?: boolean }).setupRequired === true;
    return NextResponse.json({ error: message, setupRequired }, { status: 502 });
  }
};
