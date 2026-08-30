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
import {
  getBusinessActionConfiguration,
  listBusinessActionConfigurations,
} from "./settings";
import { BUSINESS_ACTION_DEFINITIONS } from "./business";
import {
  isBusinessActionKey,
  resolveBusinessActionConfigurations,
} from "./business-config";

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
  modelArguments: {},
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
> = new Map(
  [createSupportRequest, ...BUSINESS_ACTION_DEFINITIONS].map((definition) => [
    definition.key,
    definition,
  ])
);

export type SafeActionSettingsMetadata = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  registryRequiresVerification: boolean;
  registryRequiresConfirmation: boolean;
  requireConfirmation: boolean;
  capabilityAvailable: boolean;
  configurationRequired: boolean;
  configuration: {
    collectionId: string;
    relatedCollectionId: string | null;
    fieldMapping: Record<string, string>;
    cancellationValue: string | null;
    initialStatus: string | null;
    destination: "internal_business_data" | "external_supabase";
    stockTrackingEnabled: boolean;
    customerFields: Array<{
      slot: string;
      label: string;
      type: string;
      required: boolean;
      options: string[];
    }>;
  } | null;
};

export const listSafeActionSettings = async (
  userId: string
): Promise<SafeActionSettingsMetadata[]> => {
  const definitions = [...ACTION_REGISTRY.values()];
  const [businessConfigurations, actionConfigurations] = await Promise.all([
    resolveBusinessActionConfigurations(userId),
    listBusinessActionConfigurations({ definitions, userId }),
  ]);
  return Promise.all(
    definitions.map(async (definition) => {
      const configuration =
        actionConfigurations.get(definition.key) ??
        (await getBusinessActionConfiguration({ userId, definition }));
      const businessConfiguration = isBusinessActionKey(definition.key)
        ? businessConfigurations.get(definition.key) ?? null
        : null;
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
        capabilityAvailable: isBusinessActionKey(definition.key)
          ? Boolean(businessConfiguration)
          : true,
        configurationRequired: isBusinessActionKey(definition.key),
        configuration: businessConfiguration
          ? {
              collectionId: businessConfiguration.collectionId!,
              relatedCollectionId: businessConfiguration.relatedCollectionId,
              fieldMapping: businessConfiguration.fieldMapping,
              cancellationValue: businessConfiguration.cancellationValue,
              initialStatus: businessConfiguration.initialStatus,
              destination: businessConfiguration.destination,
              stockTrackingEnabled:
                businessConfiguration.stockTrackingEnabled,
              customerFields: businessConfiguration.customerFields.map(
                ({ slot, label, type, required, options }) => ({
                  slot,
                  label,
                  type,
                  required,
                  options,
                })
              ),
            }
          : null,
      };
    })
  );
};

export const describeAvailableActions = async ({
  actionContextAvailable,
  handoffEnabled,
  userId,
}: {
  actionContextAvailable: boolean;
  handoffEnabled: boolean;
  userId?: string;
}) => {
  if (!actionContextAvailable || !userId) return "";
  const settings = await listSafeActionSettings(userId);
  const actions = settings
    .filter(
      (setting) =>
        setting.enabled &&
        setting.capabilityAvailable &&
        (setting.key !== "create_support_request" || handoffEnabled)
    )
    .map((setting) => {
      const definition = ACTION_REGISTRY.get(setting.key)!;
      const customerFields = setting.configuration?.customerFields ?? [];
      const customerValueShape = Object.fromEntries(
        customerFields.map((field) => [
          field.slot,
          `${field.required ? "required" : "optional"} ${field.type}; ask for «${field.label}»${field.options.length ? `; allowed values: ${field.options.join(" | ")}` : ""}`,
        ])
      );
      const baseArguments =
        setting.key === "create_reservation" &&
        !setting.configuration?.fieldMapping.party_size
          ? Object.fromEntries(
              Object.entries(definition.modelArguments).filter(
                ([key]) => key !== "party_size"
              )
            )
          : definition.modelArguments;
      const argumentsWithDatasetFields =
        setting.key === "create_order" || setting.key === "create_reservation"
          ? {
              ...baseArguments,
              customer_values: `required object with exactly these dataset-derived slots: ${JSON.stringify(customerValueShape)}`,
            }
          : definition.modelArguments;
      return {
        key: definition.key,
        description: definition.description,
        arguments: argumentsWithDatasetFields,
      };
    });
  return actions.length ? JSON.stringify(actions) : "";
};

export const describeRelevantActionFollowUp = (
  availableActions: string,
  customerMessage: string
) => {
  if (!availableActions) return "";
  try {
    const parsed = JSON.parse(availableActions) as Array<{
      key?: unknown;
      arguments?: unknown;
    }>;
    const relevant = parsed.find((candidate) => {
      if (typeof candidate.key !== "string") return false;
      const definition = ACTION_REGISTRY.get(candidate.key);
      return Boolean(definition?.intentGuard(customerMessage));
    });
    return relevant
      ? JSON.stringify({ key: relevant.key, arguments: relevant.arguments })
      : "";
  } catch {
    return "";
  }
};
