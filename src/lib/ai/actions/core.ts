import { createHash } from "node:crypto";

export const ACTION_LIMITS = {
  argumentChars: 2_000,
  confirmationTtlMs: 5 * 60_000,
  contextChars: 240,
  executionRetryAfterMs: 2 * 60_000,
  keyChars: 64,
  messageChars: 2_000,
  resultChars: 4_000,
} as const;

export type ActionStatus =
  | "pending_confirmation"
  | "executing"
  | "succeeded"
  | "failed"
  | "expired";

export type ActionVerification = "none" | "verified_customer";

export type ActionSchemaResult<Value> =
  | { success: true; data: Value }
  | { success: false };

export type ActionSchema<Value> = {
  parse: (value: unknown) => ActionSchemaResult<Value>;
};

export type ActionExecutionContext = {
  userId: string;
  channel: "telegram" | "instagram";
  connectionId: string;
  customerExternalId: string;
  conversationId: string;
  deliveryId: string;
  customerMessage: string;
  customerUsername?: string | null;
  customerDisplayName?: string | null;
};

export type ActionHandlerContext = ActionExecutionContext & {
  executionId: string;
};

export type ActionConfirmation =
  | { required: false }
  | { required: true; prompt: string; ttlMs?: number };

export type ActionDefinition<Input, Result> = {
  key: string;
  name: string;
  description: string;
  inputSchema: ActionSchema<Input>;
  resultSchema: ActionSchema<Result>;
  verification: ActionVerification;
  confirmation: ActionConfirmation;
  intentGuard: (customerMessage: string) => boolean;
  isEnabled: (context: ActionExecutionContext) => Promise<boolean>;
  execute: (context: ActionHandlerContext, input: Input) => Promise<Result>;
  formatResult: (result: Result) => string;
};

export type RegisteredActionDefinition = {
  key: string;
  name: string;
  description: string;
  inputSchema: ActionSchema<unknown>;
  resultSchema: ActionSchema<unknown>;
  verification: ActionVerification;
  confirmation: ActionConfirmation;
  intentGuard: (customerMessage: string) => boolean;
  isEnabled: (context: ActionExecutionContext) => Promise<boolean>;
  execute: (context: ActionHandlerContext, input: unknown) => Promise<unknown>;
  formatResult: (result: unknown) => string;
};

export const defineAction = <Input, Result>(
  definition: ActionDefinition<Input, Result>
): RegisteredActionDefinition => ({
  ...definition,
  inputSchema: {
    parse: (value) => definition.inputSchema.parse(value),
  },
  resultSchema: {
    parse: (value) => definition.resultSchema.parse(value),
  },
  execute: (context, input) => definition.execute(context, input as Input),
  formatResult: (result) => definition.formatResult(result as Result),
});

export type ActionExecutionScope = {
  userId: string;
  channel: ActionExecutionContext["channel"];
  connectionId: string;
  customerIdentityHash: string;
  conversationKeyHash: string;
};

export type StoredActionExecution = ActionExecutionScope & {
  id: string;
  actionKey: string;
  status: ActionStatus;
  arguments: unknown;
  result: unknown | null;
  idempotencyKey: string;
  requiresVerification: boolean;
  requiresConfirmation: boolean;
  confirmationExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClaimActionExecutionInput = ActionExecutionScope & {
  actionKey: string;
  status: "pending_confirmation" | "executing";
  arguments: unknown;
  idempotencyKey: string;
  requiresVerification: boolean;
  requiresConfirmation: boolean;
  confirmationExpiresAt: string | null;
};

export type ActionExecutionStore = {
  claim: (
    input: ClaimActionExecutionInput
  ) => Promise<{ created: boolean; execution: StoredActionExecution }>;
  findPending: (
    scope: ActionExecutionScope
  ) => Promise<StoredActionExecution | null>;
  markExecuting: (executionId: string) => Promise<boolean>;
  claimStaleExecution: (
    executionId: string,
    previousUpdatedAt: string
  ) => Promise<boolean>;
  markSucceeded: (executionId: string, result: unknown) => Promise<void>;
  markFailed: (executionId: string, failureCode: string) => Promise<void>;
  markExpired: (executionId: string) => Promise<void>;
};

export type ActionEngineDependencies = {
  definitions: ReadonlyMap<string, RegisteredActionDefinition>;
  store: ActionExecutionStore;
  authorizeContext: (context: ActionExecutionContext) => Promise<boolean>;
  verifyCustomer: (context: ActionExecutionContext) => Promise<boolean>;
  now?: () => Date;
};

export type ActionHandlingResult = {
  handled: boolean;
  text: string | null;
  actionKey?: string;
  status?: ActionStatus | "rejected";
};

const ACTION_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TEXT = {
  cancelled: "درخواست لغو شد.",
  disabled: "این عملیات برای این کسب‌وکار فعال نیست.",
  expired:
    "مهلت تأیید این درخواست تمام شده است. لطفاً دوباره درخواست را مطرح کنید.",
  failed: "انجام درخواست ممکن نشد؛ لطفاً کمی بعد دوباره تلاش کنید.",
  inProgress: "این درخواست در حال انجام است؛ لطفاً کمی صبر کنید.",
  rejected: "امکان انجام این درخواست وجود ندارد.",
  verificationRequired:
    "برای انجام این درخواست، ابتدا باید هویت شما تأیید شود.",
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const serializedLength = (value: unknown) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export const parseActionRequest = (
  value: unknown
): { key: string; arguments: unknown } | null => {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== 2 ||
    !keys.includes("key") ||
    !keys.includes("arguments")
  ) {
    return null;
  }
  if (
    typeof value.key !== "string" ||
    !ACTION_KEY_RE.test(value.key) ||
    value.key.length > ACTION_LIMITS.keyChars ||
    !isPlainObject(value.arguments) ||
    serializedLength(value.arguments) > ACTION_LIMITS.argumentChars
  ) {
    return null;
  }
  return { key: value.key, arguments: value.arguments };
};

const validContext = (context: ActionExecutionContext) =>
  UUID_RE.test(context.userId) &&
  UUID_RE.test(context.connectionId) &&
  context.customerExternalId.length > 0 &&
  context.customerExternalId.length <= ACTION_LIMITS.contextChars &&
  context.conversationId.length > 0 &&
  context.conversationId.length <= ACTION_LIMITS.contextChars &&
  context.deliveryId.length > 0 &&
  context.deliveryId.length <= ACTION_LIMITS.contextChars &&
  context.customerMessage.trim().length > 0 &&
  context.customerMessage.length <= ACTION_LIMITS.messageChars &&
  (!context.customerUsername ||
    context.customerUsername.length <= ACTION_LIMITS.contextChars) &&
  (!context.customerDisplayName ||
    context.customerDisplayName.length <= ACTION_LIMITS.contextChars);

const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const actionScopeFor = (
  context: ActionExecutionContext
): ActionExecutionScope => ({
  userId: context.userId,
  channel: context.channel,
  connectionId: context.connectionId,
  customerIdentityHash: hash(
    `${context.channel}:${context.connectionId}:${context.customerExternalId}`
  ),
  conversationKeyHash: hash(
    `${context.channel}:${context.connectionId}:${context.conversationId}`
  ),
});

export const actionIdempotencyKeyFor = (
  context: ActionExecutionContext,
  actionKey: string
) =>
  hash(
    `v1:${context.userId}:${context.channel}:${context.connectionId}:${context.deliveryId}:${actionKey}`
  );

const normalizeConfirmation = (value: string) =>
  value
    .toLowerCase()
    .replace(/‌/g, " ")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[.!؟?،,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const confirmationChoice = (value: string): "yes" | "no" | null => {
  if (value.length > 40) return null;
  const normalized = normalizeConfirmation(value);
  if (
    ["بله", "آره", "اره", "تأیید", "تایید", "اوکی", "yes", "ok"].includes(
      normalized
    )
  ) {
    return "yes";
  }
  if (["نه", "خیر", "لغو", "انصراف", "no", "cancel"].includes(normalized)) {
    return "no";
  }
  return null;
};

const safeRejected = (actionKey?: string): ActionHandlingResult => ({
  handled: true,
  text: TEXT.rejected,
  actionKey,
  status: "rejected",
});

export const createActionEngine = ({
  definitions,
  store,
  authorizeContext,
  verifyCustomer,
  now = () => new Date(),
}: ActionEngineDependencies) => {
  const executeClaimed = async ({
    context,
    definition,
    execution,
    input,
  }: {
    context: ActionExecutionContext;
    definition: RegisteredActionDefinition;
    execution: StoredActionExecution;
    input: unknown;
  }): Promise<ActionHandlingResult> => {
    try {
      const rawResult = await definition.execute(
        { ...context, executionId: execution.id },
        input
      );
      const parsedResult = definition.resultSchema.parse(rawResult);
      if (
        !parsedResult.success ||
        serializedLength(parsedResult.data) > ACTION_LIMITS.resultChars
      ) {
        await store.markFailed(execution.id, "invalid_result");
        return {
          handled: true,
          text: TEXT.failed,
          actionKey: definition.key,
          status: "failed",
        };
      }
      await store.markSucceeded(execution.id, parsedResult.data);
      return {
        handled: true,
        text: definition.formatResult(parsedResult.data),
        actionKey: definition.key,
        status: "succeeded",
      };
    } catch {
      await store.markFailed(execution.id, "execution_failed").catch(() => undefined);
      return {
        handled: true,
        text: TEXT.failed,
        actionKey: definition.key,
        status: "failed",
      };
    }
  };

  const authorize = async (
    definition: RegisteredActionDefinition,
    context: ActionExecutionContext
  ) => {
    if (!validContext(context)) return "rejected" as const;
    if (!(await authorizeContext(context))) return "rejected" as const;
    if (!(await definition.isEnabled(context))) return "disabled" as const;
    if (
      definition.verification === "verified_customer" &&
      !(await verifyCustomer(context))
    ) {
      return "verification" as const;
    }
    return "allowed" as const;
  };

  const executeRequested = async ({
    context,
    request,
  }: {
    context: ActionExecutionContext;
    request: unknown;
  }): Promise<ActionHandlingResult> => {
    const parsedRequest = parseActionRequest(request);
    if (!parsedRequest) return safeRejected();
    const definition = definitions.get(parsedRequest.key);
    if (!definition) return safeRejected(parsedRequest.key);
    if (!definition.intentGuard(context.customerMessage)) {
      return safeRejected(definition.key);
    }
    const parsedInput = definition.inputSchema.parse(parsedRequest.arguments);
    if (!parsedInput.success) return safeRejected(definition.key);

    const authorization = await authorize(definition, context);
    if (authorization === "rejected") return safeRejected(definition.key);
    if (authorization === "disabled") {
      return {
        handled: true,
        text: TEXT.disabled,
        actionKey: definition.key,
        status: "rejected",
      };
    }
    if (authorization === "verification") {
      return {
        handled: true,
        text: TEXT.verificationRequired,
        actionKey: definition.key,
        status: "rejected",
      };
    }

    const currentTime = now();
    const requiresConfirmation = definition.confirmation.required;
    const claim = await store.claim({
      ...actionScopeFor(context),
      actionKey: definition.key,
      status: requiresConfirmation ? "pending_confirmation" : "executing",
      arguments: parsedInput.data,
      idempotencyKey: actionIdempotencyKeyFor(context, definition.key),
      requiresVerification: definition.verification === "verified_customer",
      requiresConfirmation,
      confirmationExpiresAt: requiresConfirmation
        ? new Date(
            currentTime.getTime() +
              (definition.confirmation.ttlMs ?? ACTION_LIMITS.confirmationTtlMs)
          ).toISOString()
        : null,
    });

    if (!claim.created) {
      const existing = claim.execution;
      if (existing.status === "succeeded") {
        const result = definition.resultSchema.parse(existing.result);
        return result.success
          ? {
              handled: true,
              text: definition.formatResult(result.data),
              actionKey: definition.key,
              status: "succeeded",
            }
          : {
              handled: true,
              text: TEXT.failed,
              actionKey: definition.key,
              status: "failed",
            };
      }
      if (existing.status === "pending_confirmation") {
        return {
          handled: true,
          text: definition.confirmation.required
            ? definition.confirmation.prompt
            : TEXT.inProgress,
          actionKey: definition.key,
          status: existing.status,
        };
      }
      if (existing.status === "expired") {
        return {
          handled: true,
          text: TEXT.expired,
          actionKey: definition.key,
          status: existing.status,
        };
      }
      if (existing.status === "failed") {
        return {
          handled: true,
          text: TEXT.failed,
          actionKey: definition.key,
          status: existing.status,
        };
      }
      const updatedAt = Date.parse(existing.updatedAt);
      const stale =
        Number.isFinite(updatedAt) &&
        currentTime.getTime() - updatedAt >= ACTION_LIMITS.executionRetryAfterMs;
      if (!stale || !(await store.claimStaleExecution(existing.id, existing.updatedAt))) {
        return {
          handled: true,
          text: TEXT.inProgress,
          actionKey: definition.key,
          status: "executing",
        };
      }
    }

    if (requiresConfirmation) {
      return {
        handled: true,
        text: definition.confirmation.required
          ? definition.confirmation.prompt
          : TEXT.inProgress,
        actionKey: definition.key,
        status: "pending_confirmation",
      };
    }

    return executeClaimed({
      context,
      definition,
      execution: claim.execution,
      input: parsedInput.data,
    });
  };

  const confirmPending = async ({
    context,
    message,
  }: {
    context: ActionExecutionContext;
    message: string;
  }): Promise<ActionHandlingResult> => {
    const choice = confirmationChoice(message);
    if (!choice || !validContext(context)) return { handled: false, text: null };
    if (!(await authorizeContext(context))) return { handled: false, text: null };

    const pending = await store.findPending(actionScopeFor(context));
    if (!pending) return { handled: false, text: null };
    const definition = definitions.get(pending.actionKey);
    if (!definition || !definition.confirmation.required) {
      await store.markFailed(pending.id, "definition_unavailable");
      return safeRejected(pending.actionKey);
    }
    if (
      !pending.confirmationExpiresAt ||
      Date.parse(pending.confirmationExpiresAt) <= now().getTime()
    ) {
      await store.markExpired(pending.id);
      return {
        handled: true,
        text: TEXT.expired,
        actionKey: pending.actionKey,
        status: "expired",
      };
    }
    if (choice === "no") {
      await store.markFailed(pending.id, "customer_cancelled");
      return {
        handled: true,
        text: TEXT.cancelled,
        actionKey: pending.actionKey,
        status: "failed",
      };
    }

    const authorization = await authorize(definition, context);
    if (authorization !== "allowed") {
      await store.markFailed(pending.id, `authorization_${authorization}`);
      return authorization === "verification"
        ? {
            handled: true,
            text: TEXT.verificationRequired,
            actionKey: pending.actionKey,
            status: "failed",
          }
        : safeRejected(pending.actionKey);
    }
    const input = definition.inputSchema.parse(pending.arguments);
    if (!input.success || !(await store.markExecuting(pending.id))) {
      return {
        handled: true,
        text: TEXT.inProgress,
        actionKey: pending.actionKey,
        status: "executing",
      };
    }
    return executeClaimed({
      context,
      definition,
      execution: { ...pending, status: "executing" },
      input: input.data,
    });
  };

  return { executeRequested, confirmPending };
};
