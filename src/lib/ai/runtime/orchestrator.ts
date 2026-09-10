import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AssistantResult } from "../assistant";
import type { Conversation, RunProgressEvent, TaskDraft } from "./contracts";
import {
  createRun,
  emitProgress,
  withRun,
  RunBudgetExceeded,
  checkDeadline,
  takeStep,
} from "./budget";
import { activeDraft } from "./context";
import { endTask, isTaskCancellation } from "./tasks";
import {
  conversationStore,
  type ConversationScope,
  type ConversationStore,
} from "./store";

type State = {
  conversation: Conversation;
  scope: ConversationScope;
  store: ConversationStore;
};
const state = new AsyncLocalStorage<State>();
export const runtimeConversation = () => state.getStore()?.conversation;
export const saveDraft = async (
  draft: TaskDraft | null,
  mode?: Conversation["mode"],
) => {
  const current = state.getStore();
  if (!current) throw new Error("runtime_state_required");
  checkDeadline();
  current.conversation = await current.store.save(
    current.scope,
    current.conversation,
    draft,
    mode,
  );
};
export const runConversation = async ({
  scope,
  message,
  onProgress,
  expectedExecutionId,
  execute,
  store = conversationStore,
}: {
  scope?: ConversationScope;
  message: string;
  expectedExecutionId?: string;
  onProgress?: (event: RunProgressEvent) => Promise<void>;
  execute: () => Promise<AssistantResult>;
  store?: ConversationStore;
}): Promise<AssistantResult> => {
  const run = createRun();
  const progress: RunProgressEvent[] = [];
  return withRun(run, progress, onProgress, async () => {
    await emitProgress("run_started");
    try {
      const process = async (): Promise<AssistantResult> => {
        const current = runtimeConversation();
        if (
          expectedExecutionId &&
          current?.draft &&
          current.draft.confirmation.executionId !== expectedExecutionId
        )
          return {
            text: "این دکمه مربوط به درخواست فعلی نیست.",
            needsHuman: false,
            action: { status: "rejected" },
          };
        if (
          current?.draft &&
          !activeDraft(current.draft) &&
          !["completed", "cancelled", "expired"].includes(current.draft.phase)
        )
          await saveDraft(endTask(current.draft, "expired"));
        if (
          current &&
          ["human_active", "handoff_pending"].includes(current.mode)
        )
          return {
            text: "گفت‌وگو در انتظار پشتیبانی انسانی است.",
            needsHuman: false,
          };
        const draft = activeDraft(runtimeConversation()?.draft ?? null);
        if (
          draft &&
          (isTaskCancellation(message) ||
            (draft.phase === "confirmation_required" &&
              /^(نه|خیر|no)$/iu.test(message.trim())))
        ) {
          await saveDraft(endTask(draft, "cancelled"));
          return {
            text: "درخواست لغو شد.",
            needsHuman: false,
            action: { key: draft.type, status: "rejected" },
          };
        }
        // Any new non-confirmation turn invalidates the old prepared arguments
        // before the planner can fail, retry, or propose corrected fields.
        if (
          draft?.phase === "confirmation_required" &&
          !/^(بله|آره|اره|تأیید|تایید|اوکی|yes|ok)[.!؟?،,]*$/iu.test(
            message.trim(),
          )
        ) {
          await saveDraft({
            ...draft,
            phase: "collecting",
            confirmation: { required: true, executionId: null },
            revision: draft.revision + 1,
          });
        }
        await emitProgress("thinking");
        const result = await execute();
        const live = activeDraft(runtimeConversation()?.draft ?? null);
        if (live && result.action?.key === live.type && result.action.status === "succeeded")
          await saveDraft(endTask(live, "completed"));
        if (live && result.action?.key === live.type && result.action.status === "expired")
          await saveDraft(endTask(live, "expired"));
        if (result.needsHuman) await emitProgress("handoff");
        else if (result.retrieval?.privateVerification)
          await emitProgress("verification_required");
        else if (result.action?.status === "pending_confirmation")
          await emitProgress("confirmation_required");
        return result;
      };
      const result = scope
        ? await state.run(
            { scope, store, conversation: await store.load(scope) },
            process,
          )
        : await process();
      await emitProgress(
        result.action?.status === "failed"
          ? "failed"
          : result.text || result.needsHuman
            ? "completed"
            : "failed",
      );
      return {
        ...result,
        progress,
        run: { id: run.id, counts: { ...run.counts }, budgetExhausted: false },
      };
    } catch (error) {
      await emitProgress("failed");
      const exhausted = error instanceof RunBudgetExceeded;
      return {
        text: exhausted
          ? "پردازش این درخواست به حد مجاز رسید؛ لطفاً درخواست را کوتاه‌تر و دقیق‌تر بفرستید."
          : "ادامهٔ درخواست ممکن نشد؛ لطفاً دوباره تلاش کنید.",
        needsHuman: false,
        progress,
        run: {
          id: run.id,
          counts: { ...run.counts },
          budgetExhausted: exhausted,
        },
      };
    }
  });
};
export const missingFieldResult = async (labels: string[]) => {
  takeStep("clarification");
  await emitProgress("collecting_missing_field");
  return {
    text: `برای ادامه، لطفاً ${labels[0] ?? "اطلاعات لازم"} را بفرستید.`,
    needsHuman: false,
  };
};
