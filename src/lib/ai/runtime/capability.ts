import type { AgentDecision, CapabilityContract } from "./contracts";
import { checkDeadline, emitProgress, takeStep } from "./budget";
/** The runtime, never the model, owns capability authorization and termination. */
export const invokeCapability = async <I, O>(
  contract: CapabilityContract<I, O>,
  input: unknown,
): Promise<O> => {
  takeStep("tool");
  const parsed = contract.inputSchema.parse(input);
  if (!parsed.success || !(await contract.authorize()))
    return contract.safeFailure;
  checkDeadline();
  await emitProgress("tool_started", contract.progress);
  const result = await contract.execute(parsed.data);
  await emitProgress("tool_completed", contract.progress);
  return result;
};
/** Optional multi-decision driver. Every continuation consumes a hard step. */
export const runDecisions = async (
  decide: (previous: unknown) => Promise<AgentDecision>,
  invoke: (name: string, input: unknown) => Promise<unknown>,
): Promise<AgentDecision> => {
  let previous: unknown;
  for (let step = 0; step < 12; step++) {
    checkDeadline();
    const decision = await decide(previous);
    if (decision.type !== "capability") return decision;
    takeStep("tool");
    previous = await invoke(decision.name, decision.input);
  }
  return {
    type: "finish",
    text: "برای ادامه، لطفاً درخواست را دقیق‌تر بفرستید.",
  };
};
