import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConversationScope } from "../runtime/store";
import { ProcessingFailure } from "./failures";
/** Verification submissions are processed from memory only, never queued. */
export const prepareReplay = async (scope: ConversationScope, text: string) => {
  const { data, error } = await createAdminClient()
    .from("business_data_private_verification_challenges")
    .select("id")
    .eq("user_id", scope.userId)
    .eq("channel", scope.channel)
    .eq("connection_id", scope.connectionId)
    .eq("customer_identity_hash", scope.customerIdentityHash)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) throw new ProcessingFailure("database_unavailable");
  const sensitive =
    /^\/start\s+\S+/u.test(text) ||
    Boolean(data?.length) ||
    /^\s*[\d۰-۹٠-٩]{4,12}\s*$/.test(text) ||
    /(?:otp|password|verification|رمز|کد\s*(?:تأیید|تایید))/iu.test(text);
  return {
    replayable: !sensitive,
    text: sensitive ? "[verification input omitted]" : text.slice(0, 4096),
  };
};
