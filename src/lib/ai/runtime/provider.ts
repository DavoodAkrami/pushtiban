import type OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { reserveModel, recordModelUsage, requestTimeout } from "./budget";
export const boundedCompletion = async (
  client: OpenAI,
  body: ChatCompletionCreateParamsNonStreaming,
  options: { signal: AbortSignal },
  planner = false,
) => {
  reserveModel(body, body.max_tokens ?? 700, planner);
  const result = await client.chat.completions.create(body, {
    signal: options.signal,
    maxRetries: 0,
    timeout: requestTimeout(25_000),
  });
  recordModelUsage(result.usage);
  return result;
};
