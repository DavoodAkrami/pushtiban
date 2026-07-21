import { NextRequest, NextResponse } from "next/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  getOpenAIClient,
  getNvidiaNimClient,
  getOpenRouterClient,
  resolveOpenRouterModel,
  type ProviderId,
} from "@/configs";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatBody = {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
};

/** Extract a safe, JSON-serializable message — never log raw SDK errors (they may hold Response objects). */
const formatProviderError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? error : "Chat request failed";
  }

  let message = error.message || error.name || "Chat request failed";

  // NVIDIA / WAF often returns an HTML body inside the message
  if (/<html[\s>]/i.test(message) || /403 Forbidden/i.test(message)) {
    const code = message.match(/\b(401|403|429|500|502|503)\b/)?.[1];
    message = code
      ? `Provider returned HTTP ${code}`
      : "Provider request was forbidden";
  }

  // OpenRouter Speakeasy errors nest the real message
  const nested = (
    error as { body?: { error?: { message?: string } }; error?: string }
  ).body?.error?.message;
  if (nested && typeof nested === "string") {
    message = nested;
  }

  return message.slice(0, 500);
};

const jsonError = (error: unknown, status = 502) => {
  const message = formatProviderError(error);
  console.error("Chat API error:", message);
  return NextResponse.json({ error: message }, { status });
};

const toSseStream = (
  iterate: (
    enqueue: (payload: Record<string, unknown>) => void
  ) => Promise<void>
) => {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start: async (controller) => {
      const enqueue = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
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

const streamOpenAICompatible = async (
  client: NonNullable<ReturnType<typeof getOpenAIClient>>,
  model: string,
  messages: ChatCompletionMessageParam[],
  stream: boolean
) => {
  // NVIDIA NIM is happier with an explicit max_tokens (matches their curl examples)
  const max_tokens = 1024;

  if (stream) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      max_tokens,
    });

    return toSseStream(async (enqueue) => {
      for await (const chunk of completion) {
        const content = chunk.choices?.[0]?.delta?.content ?? "";
        if (content) enqueue({ content });
        if (chunk.choices?.[0]?.finish_reason) {
          enqueue({ done: true, model: chunk.model ?? model });
          break;
        }
      }
    });
  }

  const completion = await client.chat.completions.create({
    model,
    messages,
    stream: false,
    max_tokens,
  });

  return NextResponse.json({
    content: completion.choices?.[0]?.message?.content ?? "",
    model: completion.model ?? model,
  });
};

const streamOpenRouter = async (
  model: string,
  messages: ChatMessage[],
  stream: boolean
) => {
  const client = getOpenRouterClient();
  if (!client) {
    return NextResponse.json(
      { error: "Provider openrouter not configured" },
      { status: 400 }
    );
  }

  const resolvedModel = resolveOpenRouterModel(model);

  if (stream) {
    const completion = (await client.chat.send({
      chatRequest: {
        model: resolvedModel,
        messages,
        stream: true,
        maxTokens: 1024,
      },
    })) as AsyncIterable<{
      model?: string;
      choices?: Array<{
        finishReason?: string | null;
        delta?: { content?: string | null };
      }>;
    }>;

    return toSseStream(async (enqueue) => {
      for await (const chunk of completion) {
        const content = chunk.choices?.[0]?.delta?.content ?? "";
        if (content) enqueue({ content });
        if (chunk.choices?.[0]?.finishReason) {
          enqueue({ done: true, model: chunk.model ?? resolvedModel });
          break;
        }
      }
    });
  }

  const completion = await client.chat.send({
    chatRequest: {
      model: resolvedModel,
      messages,
      stream: false,
      maxTokens: 1024,
    },
  });

  if (!("choices" in completion)) {
    return NextResponse.json(
      { error: "Unexpected OpenRouter response" },
      { status: 500 }
    );
  }

  const content =
    typeof completion.choices?.[0]?.message?.content === "string"
      ? completion.choices[0].message.content
      : "";

  return NextResponse.json({
    content,
    model: completion.model ?? resolvedModel,
  });
};

export const POST = async (request: NextRequest) => {
  try {
    const body = (await request.json()) as ChatBody;
    const { provider: providerId, model, messages, stream = true } = body;

    if (!providerId || !model || !messages?.length) {
      return NextResponse.json(
        { error: "provider, model, and messages are required" },
        { status: 400 }
      );
    }

    const openaiMessages = messages as ChatCompletionMessageParam[];

    switch (providerId) {
      case "openai": {
        const client = getOpenAIClient();
        if (!client) {
          return NextResponse.json(
            { error: "Provider openai not configured" },
            { status: 400 }
          );
        }
        return await streamOpenAICompatible(
          client,
          model,
          openaiMessages,
          stream
        );
      }
      case "nvidia-nim": {
        const client = getNvidiaNimClient();
        if (!client) {
          return NextResponse.json(
            { error: "Provider nvidia-nim not configured" },
            { status: 400 }
          );
        }
        return await streamOpenAICompatible(
          client,
          model,
          openaiMessages,
          stream
        );
      }
      case "openrouter":
        return await streamOpenRouter(model, messages, stream);
      default:
        return NextResponse.json(
          { error: `Unknown provider: ${providerId as string}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return jsonError(error);
  }
};
