import type { ChatTurn } from "../memory";

export type ConversationMode =
  | "ai_active"
  | "handoff_pending"
  | "human_active"
  | "resolved";
export type TaskPhase =
  | "collecting"
  | "verification_required"
  | "confirmation_required"
  | "completed"
  | "cancelled"
  | "expired";
export type TaskDraft = {
  id: string;
  type: "create_order" | "create_reservation";
  revision: number;
  phase: TaskPhase;
  fields: Record<string, unknown>;
  missingFields: string[];
  configurationKey?: string;
  resourceReferences: { productQuery?: string };
  confirmation: { required: boolean; executionId: string | null };
  verification: { required: boolean; sessionReference: string | null };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
export type Conversation = {
  id: string;
  revision: number;
  mode: ConversationMode;
  draft: TaskDraft | null;
};
export type IncomingEvent = {
  channel: "telegram" | "instagram" | "preview";
  deliveryId: string;
  text: string;
};
export type RunBudget = {
  modelCalls: number;
  plannerCalls: number;
  toolCalls: number;
  retrievals: number;
  retries: number;
  clarifications: number;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
};
export type RunStep =
  | "planner"
  | "model"
  | "tool"
  | "retrieval"
  | "clarification";
export type ProgressCode =
  | "run_started"
  | "thinking"
  | "retrieval_started"
  | "retrieval_completed"
  | "tool_started"
  | "tool_completed"
  | "collecting_missing_field"
  | "verification_required"
  | "confirmation_required"
  | "generating_answer"
  | "handoff"
  | "completed"
  | "failed";
export type RunProgressEvent = {
  run_id: string;
  sequence: number;
  type: ProgressCode;
  code: ProgressCode;
  display_text: string;
  timestamp: string;
  metadata: { operation?: "products" | "knowledge" | "action" };
};
export type AgentDecision =
  | {
      type:
        | "answer"
        | "missing_information"
        | "confirmation"
        | "verification"
        | "handoff"
        | "finish";
      text: string | null;
    }
  | { type: "capability"; name: string; input: unknown };
export type CapabilityContract<Input, Output> = {
  name: string;
  description: string;
  appropriateWhen: string;
  inputSchema: {
    parse: (
      input: unknown,
    ) => { success: true; data: Input } | { success: false };
  };
  readOnly: boolean;
  confirmationRequired: boolean;
  policy: readonly string[];
  progress: "products" | "knowledge" | "action";
  authorize: () => Promise<boolean>;
  execute: (input: Input) => Promise<Output>;
  safeFailure: Output;
};
export type ContextEvidence = {
  text: string;
  source: "business" | "retrieval" | "customer";
  trust: "untrusted_data";
  expiresAt?: string;
  privateScope?: string;
};
export type ContextPolicy = {
  historyTurns: number;
  historyChars: number;
  taskChars: number;
  trim: (turns: ChatTurn[]) => ChatTurn[];
};
export type Run = {
  id: string;
  startedAt: number;
  budget: Readonly<RunBudget>;
  counts: Record<
    | RunStep
    | "retries"
    | "steps"
    | "reservedTokens"
    | "reservedOutput"
    | "loggedInput"
    | "loggedOutput",
    number
  >;
};
