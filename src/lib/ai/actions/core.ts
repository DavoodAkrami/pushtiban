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
  customerIntentContext?: string;
  customerUsername?: string | null;
  customerDisplayName?: string | null;
};

export type ActionHandlerContext = ActionExecutionContext & {
  executionId: string;
};

export type ActionConfirmation =
  | { required: false }
  | {
      required: true;
      prompt: string | ((preparedInput: unknown) => string);
      ttlMs?: number;
    };

export type ActionPreparationResult<Value> =
  | { success: true; data: Value }
  | { success: false; text: string };

/** Per-business limits. These can only add safeguards to a registry action. */
export type ActionBusinessConfiguration = {
  enabled: boolean;
  requireConfirmation: boolean;
};

/** Safe, owner-facing metadata. Execution details stay private to the registry. */
export type ActionSettingsMetadata = {
  displayName: string;
  description: string;
  defaultEnabled: boolean;
};

export type ActionDefinition<Input, Result, PreparedInput = Input> = {
  key: string;
  name: string;
  description: string;
  modelArguments: Record<string, string>;
  inputSchema: ActionSchema<Input>;
  preparedInputSchema?: ActionSchema<PreparedInput>;
  resultSchema: ActionSchema<Result>;
  verification: ActionVerification;
  confirmation: ActionConfirmation;
  settings: ActionSettingsMetadata;
  intentGuard: (customerMessage: string) => boolean;
  isEnabled: (context: ActionExecutionContext) => Promise<boolean>;
  prepare?: (
    context: ActionExecutionContext,
    input: Input
  ) => Promise<ActionPreparationResult<PreparedInput>>;
  execute: (
    context: ActionHandlerContext,
    input: PreparedInput
  ) => Promise<Result>;
  formatResult: (result: Result) => string;
};

export type RegisteredActionDefinition = {
  key: string;
  name: string;
  description: string;
  modelArguments: Record<string, string>;
  inputSchema: ActionSchema<unknown>;
  preparedInputSchema: ActionSchema<unknown>;
  resultSchema: ActionSchema<unknown>;
  verification: ActionVerification;
  confirmation: ActionConfirmation;
  settings: ActionSettingsMetadata;
  intentGuard: (customerMessage: string) => boolean;
  isEnabled: (context: ActionExecutionContext) => Promise<boolean>;
  prepare: (
    context: ActionExecutionContext,
    input: unknown
  ) => Promise<ActionPreparationResult<unknown>>;
  execute: (context: ActionHandlerContext, input: unknown) => Promise<unknown>;
  formatResult: (result: unknown) => string;
};

export const defineAction = <Input, Result, PreparedInput = Input>(
  definition: ActionDefinition<Input, Result, PreparedInput>
): RegisteredActionDefinition => ({
  ...definition,
  inputSchema: {
    parse: (value) => definition.inputSchema.parse(value),
  },
  preparedInputSchema: {
    parse: (value) =>
      (definition.preparedInputSchema ?? definition.inputSchema).parse(
        value as PreparedInput & Input
      ),
  },
  resultSchema: {
    parse: (value) => definition.resultSchema.parse(value),
  },
  prepare: definition.prepare
    ? (context, input) => definition.prepare!(context, input as Input)
    : async (_context, input) => ({ success: true, data: input }),
  execute: (context, input) =>
    definition.execute(context, input as PreparedInput),
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
  findByIdempotency: (
    userId: string,
    idempotencyKey: string
  ) => Promise<StoredActionExecution | null>;
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
  resolveConfiguration: (
    context: ActionExecutionContext,
    definition: RegisteredActionDefinition
  ) => Promise<ActionBusinessConfiguration>;
  now?: () => Date;
};

export type ActionHandlingResult = {
  handled: boolean;
  text: string | null;
  actionKey?: string;
  status?: ActionStatus | "rejected";
};

export class ActionPublicError extends Error {
  readonly code: string;
  readonly publicMessage: string;

  constructor(code: string, publicMessage: string) {
    super(code);
    this.name = "ActionPublicError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

type ActionAuthorization =
  | { result: "rejected" | "disabled" | "verification" }
  | { result: "allowed"; configuration: ActionBusinessConfiguration };

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
  confirmationRequired:
    "برای انجام این درخواست، تأیید شما لازم است. آیا ادامه می‌دهید؟",
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
  (!context.customerIntentContext ||
    context.customerIntentContext.length <= ACTION_LIMITS.messageChars) &&
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
  resolveConfiguration,
  now = () => new Date(),
}: ActionEngineDependencies) => {
  const confirmationPrompt = (
    definition: RegisteredActionDefinition,
    preparedInput: unknown
  ) => {
    if (!definition.confirmation.required) return TEXT.confirmationRequired;
    const prompt = definition.confirmation.prompt;
    return typeof prompt === "function" ? prompt(preparedInput) : prompt;
  };
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
    let parsedResult: ActionSchemaResult<unknown>;
    try {
      const rawResult = await definition.execute(
        { ...context, executionId: execution.id },
        input
      );
      parsedResult = definition.resultSchema.parse(rawResult);
    } catch (error) {
      const publicError =
        error instanceof ActionPublicError ? error : null;
      await store
        .markFailed(execution.id, publicError?.code ?? "execution_failed")
        .catch(() => undefined);
      return {
        handled: true,
        text: publicError?.publicMessage ?? TEXT.failed,
        actionKey: definition.key,
        status: "failed",
      };
    }
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
    try {
      await store.markSucceeded(execution.id, parsedResult.data);
    } catch {
      // The authoritative side effect may already exist. Keep the execution
      // retryable so the handler can recover it by execution ID instead of
      // reporting a definitive failure or creating a duplicate.
      return {
        handled: true,
        text: TEXT.inProgress,
        actionKey: definition.key,
        status: "executing",
      };
    }
    return {
      handled: true,
      text: definition.formatResult(parsedResult.data),
      actionKey: definition.key,
      status: "succeeded",
    };
  };

  const handleExistingExecution = async ({
    context,
    currentTime,
    definition,
    existing,
  }: {
    context: ActionExecutionContext;
    currentTime: Date;
    definition: RegisteredActionDefinition;
    existing: StoredActionExecution;
  }): Promise<ActionHandlingResult> => {
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
        text: existing.requiresConfirmation
          ? confirmationPrompt(definition, existing.arguments)
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
    if (
      !stale ||
      !(await store.claimStaleExecution(existing.id, existing.updatedAt))
    ) {
      return {
        handled: true,
        text: TEXT.inProgress,
        actionKey: definition.key,
        status: "executing",
      };
    }
    const preparedInput = definition.preparedInputSchema.parse(existing.arguments);
    if (!preparedInput.success) {
      await store.markFailed(existing.id, "invalid_prepared_arguments");
      return {
        handled: true,
        text: TEXT.failed,
        actionKey: definition.key,
        status: "failed",
      };
    }
    return executeClaimed({
      context,
      definition,
      execution: existing,
      input: preparedInput.data,
    });
  };

  const authorize = async (
    definition: RegisteredActionDefinition,
    context: ActionExecutionContext
  ): Promise<ActionAuthorization> => {
    if (!validContext(context)) return { result: "rejected" };
    if (!(await authorizeContext(context))) return { result: "rejected" };
    if (!(await definition.isEnabled(context))) return { result: "disabled" };
    const configuration = await resolveConfiguration(context, definition);
    if (!configuration.enabled) return { result: "disabled" };
    if (
      definition.verification === "verified_customer" &&
      !(await verifyCustomer(context))
    ) {
      return { result: "verification" };
    }
    return { result: "allowed" as const, configuration };
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
    if (
      !definition.intentGuard(
        context.customerIntentContext ?? context.customerMessage
      )
    ) {
      return safeRejected(definition.key);
    }
    const parsedInput = definition.inputSchema.parse(parsedRequest.arguments);
    if (!parsedInput.success) return safeRejected(definition.key);

    const authorization = await authorize(definition, context);
    if (authorization.result !== "allowed") {
      if (authorization.result === "rejected") return safeRejected(definition.key);
      return {
        handled: true,
        text:
          authorization.result === "verification"
            ? TEXT.verificationRequired
            : TEXT.disabled,
        actionKey: definition.key,
        status: "rejected",
      };
    }

    const currentTime = now();
    const idempotencyKey = actionIdempotencyKeyFor(context, definition.key);
    const existingExecution = await store.findByIdempotency(
      context.userId,
      idempotencyKey
    );
    if (existingExecution) {
      return handleExistingExecution({
        context,
        currentTime,
        definition,
        existing: existingExecution,
      });
    }

    const preparation = await definition.prepare(context, parsedInput.data);
    if (!preparation.success) {
      return {
        handled: true,
        text: preparation.text.slice(0, ACTION_LIMITS.resultChars),
        actionKey: definition.key,
        status: "rejected",
      };
    }
    const preparedInput = definition.preparedInputSchema.parse(preparation.data);
    if (!preparedInput.success) return safeRejected(definition.key);

    const requiresConfirmation =
      definition.confirmation.required || authorization.configuration.requireConfirmation;
    const confirmationTtl = definition.confirmation.required
      ? (definition.confirmation.ttlMs ?? ACTION_LIMITS.confirmationTtlMs)
      : ACTION_LIMITS.confirmationTtlMs;
    const claim = await store.claim({
      ...actionScopeFor(context),
      actionKey: definition.key,
      status: requiresConfirmation ? "pending_confirmation" : "executing",
      arguments: preparedInput.data,
      idempotencyKey,
      requiresVerification: definition.verification === "verified_customer",
      requiresConfirmation,
      confirmationExpiresAt: requiresConfirmation
        ? new Date(
            currentTime.getTime() +
              confirmationTtl
          ).toISOString()
        : null,
    });

    if (!claim.created) {
      return handleExistingExecution({
        context,
        currentTime,
        definition,
        existing: claim.execution,
      });
    }

    if (requiresConfirmation) {
      return {
        handled: true,
        text: confirmationPrompt(definition, preparedInput.data),
        actionKey: definition.key,
        status: "pending_confirmation",
      };
    }

    return executeClaimed({
      context,
      definition,
      execution: claim.execution,
      input: preparedInput.data,
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
    if (!definition || !pending.requiresConfirmation) {
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
    if (authorization.result !== "allowed") {
      await store.markFailed(pending.id, `authorization_${authorization.result}`);
      return authorization.result === "verification"
        ? {
            handled: true,
            text: TEXT.verificationRequired,
            actionKey: pending.actionKey,
            status: "failed",
          }
        : safeRejected(pending.actionKey);
    }
    const input = definition.preparedInputSchema.parse(pending.arguments);
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
