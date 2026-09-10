import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type {
  Run,
  RunBudget,
  RunProgressEvent,
  ProgressCode,
  RunStep,
} from "./contracts";

export const DEFAULT_RUN_BUDGET: Readonly<RunBudget> = Object.freeze({
  modelCalls: 4,
  plannerCalls: 2,
  toolCalls: 4,
  retrievals: 3,
  retries: 2,
  clarifications: 1,
  steps: 12,
  inputTokens: 24_000,
  outputTokens: 2_800,
  totalTokens: 80_000,
  durationMs: 55_000,
});
export class RunBudgetExceeded extends Error {
  constructor() {
    super("run_budget_exhausted");
  }
}
const TEXT: Record<ProgressCode, string> = {
  run_started: "در حال فکر کردن…",
  thinking: "در حال بررسی پیام…",
  retrieval_started: "در حال جست‌وجوی اطلاعات…",
  retrieval_completed: "جست‌وجوی اطلاعات تمام شد.",
  tool_started: "در حال بررسی درخواست…",
  tool_completed: "بررسی درخواست تمام شد.",
  collecting_missing_field: "برای ادامه، اطلاعات بیشتری لازم است.",
  verification_required: "تأیید هویت لازم است.",
  confirmation_required: "درخواست آمادهٔ تأیید شماست.",
  generating_answer: "در حال آماده‌سازی پاسخ…",
  handoff: "درخواست پشتیبانی انسانی آماده است.",
  completed: "پاسخ آماده است.",
  failed: "پردازش کامل نشد؛ لطفاً دوباره تلاش کنید.",
};
export const createRun = (
  limits: Partial<RunBudget> = {},
  now = Date.now(),
): Run => ({
  id: randomUUID(),
  startedAt: now,
  budget: Object.freeze({ ...DEFAULT_RUN_BUDGET, ...limits }),
  counts: {
    model: 0,
    planner: 0,
    tool: 0,
    retrieval: 0,
    clarification: 0,
    retries: 0,
    steps: 0,
    reservedTokens: 0,
    reservedOutput: 0,
    loggedInput: 0,
    loggedOutput: 0,
  },
});
type RuntimeScope = {
  run: Run;
  events: RunProgressEvent[];
  sink?: (event: RunProgressEvent) => Promise<void>;
};
const scope = new AsyncLocalStorage<RuntimeScope>();
export const currentRun = () => scope.getStore()?.run;
export const withRun = <T>(
  run: Run,
  events: RunProgressEvent[],
  sink: RuntimeScope["sink"],
  task: () => Promise<T>,
) => scope.run({ run, events, sink }, task);
export const checkDeadline = (run = currentRun()) => {
  if (run && Date.now() - run.startedAt >= run.budget.durationMs)
    throw new RunBudgetExceeded();
};
export const takeStep = (kind: RunStep, run = currentRun()) => {
  if (!run) return;
  checkDeadline(run);
  const limit = {
    model: run.budget.modelCalls,
    planner: run.budget.plannerCalls,
    tool: run.budget.toolCalls,
    retrieval: run.budget.retrievals,
    clarification: run.budget.clarifications,
  }[kind];
  if (run.counts[kind] >= limit || run.counts.steps >= run.budget.steps)
    throw new RunBudgetExceeded();
  run.counts[kind]++;
  run.counts.steps++;
};
/** UTF-8 bytes plus protocol allowance conservatively bound byte-token models. */
export const tokenUpperBound = (payload: unknown) =>
  Buffer.byteLength(JSON.stringify(payload), "utf8") + 512;
export const reserveModel = (
  payload: unknown,
  output: number,
  planner = false,
) => {
  const run = currentRun();
  if (!run) return;
  checkDeadline(run);
  const input = tokenUpperBound(payload);
  if (
    input > run.budget.inputTokens ||
    run.counts.reservedTokens + input + output > run.budget.totalTokens ||
    run.counts.reservedOutput + output > run.budget.outputTokens
  )
    throw new RunBudgetExceeded();
  const previous = planner
    ? run.counts.planner
    : run.counts.model - run.counts.planner;
  if (previous > 0) {
    if (run.counts.retries >= run.budget.retries) throw new RunBudgetExceeded();
    run.counts.retries++;
  }
  takeStep("model", run);
  if (planner) takeStep("planner", run);
  run.counts.reservedTokens += input + output;
  run.counts.reservedOutput += output;
};
export const recordModelUsage = (usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
}) => {
  const run = currentRun();
  if (run) {
    run.counts.loggedInput += usage?.prompt_tokens ?? 0;
    run.counts.loggedOutput += usage?.completion_tokens ?? 0;
  }
};
export const requestTimeout = (maximum: number) => {
  const run = currentRun();
  checkDeadline(run);
  return run
    ? Math.max(
        1,
        Math.min(maximum, run.budget.durationMs - (Date.now() - run.startedAt)),
      )
    : maximum;
};
export const emitProgress = async (
  code: ProgressCode,
  operation?: RunProgressEvent["metadata"]["operation"],
) => {
  const active = scope.getStore();
  if (!active) return;
  const event: RunProgressEvent = {
    run_id: active.run.id,
    sequence: active.events.length + 1,
    type: code,
    code,
    display_text:
      code === "retrieval_started" && operation === "products"
        ? "در حال پیدا کردن محصولات…"
        : TEXT[code],
    metadata: operation ? { operation } : {},
    timestamp: new Date().toISOString(),
  };
  active.events.push(event);
  // A presentation failure must never suppress canonical results.
  try {
    await active.sink?.(event);
  } catch {
    /* Delivery owns retries. */
  }
};

export const reserveEmbedding = (text: string) => {
  const run = currentRun();
  if (!run) return;
  takeStep("retrieval", run);
  const input = tokenUpperBound(text);
  if (
    input > run.budget.inputTokens ||
    run.counts.reservedTokens + input > run.budget.totalTokens
  )
    throw new RunBudgetExceeded();
  run.counts.reservedTokens += input;
};
