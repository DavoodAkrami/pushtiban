import {
  classifyFailure,
  rethrowProcessingFailure,
} from "../processing/failures";
import { reserveUsage, reconcileUsage } from "../processing/usage";
import { persistBudget, trace } from "../processing/context";
import type OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import {
  reserveModel,
  recordModelUsage,
  requestTimeout,
  currentRun,
  tokenUpperBound,
} from "./budget";
export const boundedCompletion = async (
  client: OpenAI,
  body: ChatCompletionCreateParamsNonStreaming,
  options: { signal: AbortSignal },
  planner = false,
  provider = "openai",
) => {
  reserveModel(body, body.max_tokens ?? 700, planner);
  const run = currentRun();
  const reservation = await reserveUsage(
    run,
    planner ? "intent" : "chat",
    provider,
    body.model,
    tokenUpperBound(body) + (body.max_tokens ?? 700),
  );
  try {
    const result = await client.chat.completions.create(body, {
      signal: options.signal,
      maxRetries: 0,
      timeout: requestTimeout(25_000),
    });
    recordModelUsage(result.usage);
    await reconcileUsage(reservation, result.usage);
    await persistBudget(run);
    await trace("model_completed", { provider, model: body.model });
    return result;
  } catch (error) {
    rethrowProcessingFailure(error);
    await trace("model_failed", {
      provider,
      model: body.model,
      failure_category: classifyFailure(error),
    });
    await reconcileUsage(reservation, null);
    throw error;
  }
};
