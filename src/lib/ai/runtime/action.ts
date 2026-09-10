import "server-only";
import { createHash } from "node:crypto";
import { ACTION_REGISTRY, listSafeActionSettings } from "../actions/registry";
import {
  parseActionRequest,
  type ActionExecutionContext,
  type ActionHandlingResult,
} from "../actions/core";
import { executeModelAction } from "../actions/server";
import { activeDraft } from "./context";
import { mergeTask } from "./tasks";
import { runtimeConversation, saveDraft } from "./orchestrator";
import { invokeCapability } from "./capability";
import { emitProgress, takeStep } from "./budget";

export const handleRuntimeAction = async (
  raw: unknown,
  context: ActionExecutionContext,
  preview = false,
): Promise<ActionHandlingResult> => {
  const request = parseActionRequest(raw);
  if (!request) return { handled: false, text: null };
  const definition = ACTION_REGISTRY.get(request.key);
  if (!definition) return { handled: false, text: null };
  const current = runtimeConversation();
  let args = request.arguments;
  let executionContext = context;
  if (
    current &&
    (request.key === "create_order" || request.key === "create_reservation")
  ) {
    const previous = activeDraft(current.draft);
    if (!previous && !definition.intentGuard(context.customerMessage))
      return { handled: false, text: null };
    const setting = (await listSafeActionSettings(context.userId)).find(
      (item) =>
        item.key === request.key && item.enabled && item.capabilityAvailable,
    );
    if (!setting?.configuration)
      return {
        handled: true,
        text: "این عملیات در حال حاضر در دسترس نیست.",
        status: "rejected",
      };
    const configurationKey = createHash("sha256")
      .update(JSON.stringify(setting.configuration))
      .digest("hex");
    if (
      previous?.configurationKey &&
      previous.configurationKey !== configurationKey
    ) {
      await saveDraft({
        ...previous,
        phase: "cancelled",
        fields: {},
        confirmation: { required: true, executionId: null },
      });
      return {
        handled: true,
        text: "تنظیمات این درخواست تغییر کرده است؛ لطفاً درخواست تازه‌ای شروع کنید.",
        status: "rejected",
      };
    }
    const slots = setting.configuration.customerFields;
    const required = [
      ...(request.key === "create_order"
        ? ["product_query"]
        : ["date", "time"]),
      ...slots.filter((field) => field.required).map((field) => field.slot),
    ];
    const draft = mergeTask({
      previous,
      type: request.key,
      patch: args,
      message: context.customerMessage,
      required,
      allowedSlots: slots.map((field) => field.slot),
    });
    draft.configurationKey = configurationKey;
    // Parse without relying on defaults to overwrite previously supplied values.
    if (!definition.inputSchema.parse(draft.fields).success)
      return {
        handled: true,
        text: "اطلاعات واردشده معتبر نیست؛ لطفاً دوباره بفرستید.",
        status: "rejected",
      };
    await saveDraft(draft);
    args = draft.fields;
    executionContext = {
      ...context,
      customerIntentContext:
        request.key === "create_order" ? "ثبت سفارش جدید" : "ثبت رزرو جدید",
      taskCustomerValues: draft.fields.customer_values as Record<
        string,
        unknown
      >,
    };
    if (draft.missingFields.length) {
      takeStep("clarification");
      await emitProgress("collecting_missing_field");
      const key = draft.missingFields[0];
      const label =
        slots.find((field) => field.slot === key)?.label ??
        { product_query: "نام محصول", date: "تاریخ رزرو", time: "ساعت رزرو" }[
          key
        ] ??
        "اطلاعات لازم";
      return {
        handled: true,
        text: `برای ادامه، لطفاً ${label} را بفرستید.`,
        actionKey: request.key,
        status: "collecting",
      };
    }
    if (preview)
      return {
        handled: true,
        text: "اطلاعات درخواست کامل است. در گفت‌وگوی واقعی، موجودی و قیمت بررسی و تأیید شما دریافت می‌شود. این آزمایش عملیاتی ثبت نمی‌کند.",
        actionKey: request.key,
        status: "collecting",
      };
  } else if (preview)
    return { handled: true, text: "اجرای این عملیات در پیش‌نمایش مجاز نیست." };
  const result = await invokeCapability(
    {
      name: definition.key,
      description: definition.description,
      appropriateWhen: "The customer requests this registered operation.",
      inputSchema: definition.inputSchema,
      readOnly: definition.key === "check_availability",
      confirmationRequired: definition.confirmation.required,
      policy: [
        "global_owner_channel_controls",
        "registry_schema",
        "verification",
        "confirmation",
        "live_business_validation",
        "idempotency",
      ],
      progress: "action",
      authorize: () => definition.isEnabled(executionContext),
      execute: (input) =>
        executeModelAction({
          context: executionContext,
          request: { key: request.key, arguments: input },
        }),
      safeFailure: {
        handled: true,
        text: "این عملیات در دسترس نیست.",
        status: "rejected",
      } as ActionHandlingResult,
    },
    args,
  );
  const draft = activeDraft(runtimeConversation()?.draft ?? null);
  if (draft && request.key === draft.type && result.status === "pending_confirmation" && result.executionId) {
    await saveDraft({
      ...draft,
      phase: "confirmation_required",
      confirmation: { required: true, executionId: result.executionId },
    });
  }
  return result;
};
