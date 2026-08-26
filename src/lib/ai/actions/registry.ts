import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { upsertConversationForCustomer } from "@/lib/ai/inbox";
import {
  defineAction,
  type ActionExecutionContext,
  type ActionSchema,
  type RegisteredActionDefinition,
} from "./core";
import { isSupportRequestMessage } from "./support-intent";
import { getBusinessActionConfiguration } from "./settings";

export { isSupportRequestMessage } from "./support-intent";

type CreateSupportRequestInput = Record<string, never>;

type CreateSupportRequestResult = {
  conversationId: string;
  status: "open";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emptyObjectSchema: ActionSchema<CreateSupportRequestInput> = {
  parse: (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
      ? { success: true, data: {} }
      : { success: false },
};

const supportRequestResultSchema: ActionSchema<CreateSupportRequestResult> = {
  parse: (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { success: false };
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.conversationId !== "string" ||
      !UUID_RE.test(candidate.conversationId) ||
      candidate.status !== "open"
    ) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        conversationId: candidate.conversationId,
        status: "open",
      },
    };
  },
};

const supportRequestsEnabled = async (context: ActionExecutionContext) => {
  const { data, error } = await createAdminClient()
    .from("ai_assistant_settings")
    .select("is_enabled, human_handoff_enabled")
    .eq("user_id", context.userId)
    .maybeSingle();
  return (
    !error &&
    data?.is_enabled === true &&
    data?.human_handoff_enabled === true
  );
};

const createSupportRequest = defineAction<
  CreateSupportRequestInput,
  CreateSupportRequestResult
>({
  key: "create_support_request",
  name: "Create support request",
  description:
    "Create an inbox support request only when the customer explicitly asks to register or open a support request. Arguments must be an empty object.",
  inputSchema: emptyObjectSchema,
  resultSchema: supportRequestResultSchema,
  verification: "none",
  confirmation: { required: false },
  settings: {
    displayName: "ثبت درخواست پشتیبانی",
    description:
      "به دستیار اجازه می‌دهد وقتی مشتری صریحاً درخواست پشتیبانی می‌کند، گفت‌وگو را برای پیگیری در صندوق ورودی ثبت کند.",
    defaultEnabled: true,
  },
  intentGuard: isSupportRequestMessage,
  isEnabled: supportRequestsEnabled,
  execute: async (context) => {
    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("support_messages")
      .select("conversation_id")
      .eq("action_execution_id", context.executionId)
      .maybeSingle();
    if (existingError) {
      throw new Error("Support request idempotency lookup failed.");
    }
    if (existing?.conversation_id) {
      return { conversationId: existing.conversation_id, status: "open" };
    }

    const conversation = await upsertConversationForCustomer({
      channel: context.channel,
      connectionId: context.connectionId,
      customerExternalId: context.customerExternalId,
      userId: context.userId,
      customerUsername: context.customerUsername,
      customerDisplayName: context.customerDisplayName,
      messageText: context.customerMessage,
      queuedReason: "customer_request",
      actionExecutionId: context.executionId,
    });
    return { conversationId: conversation.id, status: "open" };
  },
  formatResult: () =>
    "درخواست پشتیبانی شما ثبت شد؛ پشتیبان از صندوق ورودی آن را پیگیری می‌کند.",
});

export const ACTION_REGISTRY: ReadonlyMap<
  string,
  RegisteredActionDefinition
> = new Map([[createSupportRequest.key, createSupportRequest]]);

export type SafeActionSettingsMetadata = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  registryRequiresVerification: boolean;
  registryRequiresConfirmation: boolean;
  requireConfirmation: boolean;
};

export const listSafeActionSettings = async (
  userId: string
): Promise<SafeActionSettingsMetadata[]> =>
  Promise.all(
    [...ACTION_REGISTRY.values()].map(async (definition) => {
      const configuration = await getBusinessActionConfiguration({
        userId,
        definition,
      });
      return {
        key: definition.key,
        name: definition.settings.displayName,
        description: definition.settings.description,
        enabled: configuration.enabled,
        registryRequiresVerification:
          definition.verification === "verified_customer",
        registryRequiresConfirmation: definition.confirmation.required,
        requireConfirmation:
          definition.confirmation.required || configuration.requireConfirmation,
      };
    })
  );

export const describeAvailableActions = async ({
  actionContextAvailable,
  handoffEnabled,
  userId,
}: {
  actionContextAvailable: boolean;
  handoffEnabled: boolean;
  userId?: string;
}) => {
  if (!actionContextAvailable || !handoffEnabled || !userId) return "";
  const settings = await listSafeActionSettings(userId);
  const actions = settings
    .filter((setting) => setting.enabled)
    .map((setting) => {
      const definition = ACTION_REGISTRY.get(setting.key)!;
      return {
        key: definition.key,
        description: definition.description,
        arguments: {},
      };
    });
  return actions.length ? JSON.stringify(actions) : "";
};
