import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActionBusinessConfiguration,
  RegisteredActionDefinition,
} from "./core";

type ActionSettingRow = {
  is_enabled: boolean;
  require_confirmation: boolean;
};

const SETUP_ERROR_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);

const defaultConfiguration = (
  definition: RegisteredActionDefinition
): ActionBusinessConfiguration => ({
  // The existing support request is the only compatibility exception. A new
  // registry action needs an owner-created row before it is usable.
  enabled:
    definition.key === "create_support_request" &&
    definition.settings.defaultEnabled,
  requireConfirmation: false,
});

/**
 * Read one action's tenant-owned restrictions for the webhook runtime.
 * A missing row uses the registry default, which preserves the existing
 * support-request behavior while keeping future actions opt-in.
 */
export const getBusinessActionConfiguration = async ({
  userId,
  definition,
}: {
  userId: string;
  definition: RegisteredActionDefinition;
}): Promise<ActionBusinessConfiguration> => {
  const fallback = defaultConfiguration(definition);

  try {
    const { data, error } = await createAdminClient()
      .from("business_action_settings")
      .select("is_enabled, require_confirmation")
      .eq("user_id", userId)
      .eq("action_key", definition.key)
      .maybeSingle();

    if (error) {
      // The dashboard migration may not yet be installed. Existing low-risk
      // actions retain their documented default; all new actions remain off.
      if (SETUP_ERROR_CODES.has(error.code)) return fallback;
      return { enabled: false, requireConfirmation: false };
    }

    const row = data as ActionSettingRow | null;
    return row
      ? {
          enabled: row.is_enabled === true,
          requireConfirmation: row.require_confirmation === true,
        }
      : fallback;
  } catch {
    return { enabled: false, requireConfirmation: false };
  }
};

export const isActionSettingsSetupError = (code?: string) =>
  Boolean(code && SETUP_ERROR_CODES.has(code));
