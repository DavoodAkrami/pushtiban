import { NextResponse, type NextRequest } from "next/server";
import {
  AUTOMATION_COLUMNS,
  hasValidOrigin,
  isSetupError,
  jsonError,
  parseDraft,
  readBody,
  requireConnection,
  SETUP_MESSAGE,
  toAutomation,
  type AutomationRow,
} from "@/lib/instagram/automations-api";
import {
  isInstagramTriggerType,
  type InstagramTriggerType,
} from "@/lib/instagram/automations";
import { activateInstagramWebhook } from "@/lib/instagram/webhook";

export const runtime = "nodejs";

/**
 * GET /api/instagram/automations?trigger=comment|dm_keyword|story
 *
 * `story` is a convenience for the editor, which shows both story triggers in
 * one list; every other value maps to a single trigger_type.
 */
export const GET = async (request: NextRequest) => {
  const resolved = await requireConnection();
  if ("error" in resolved) return resolved.error;

  const { account, admin, userId } = resolved;
  if (!account) return NextResponse.json({ account: null, automations: [] });

  const trigger = new URL(request.url).searchParams.get("trigger");
  const triggers: InstagramTriggerType[] =
    trigger === "story"
      ? ["story_mention", "story_reply"]
      : isInstagramTriggerType(trigger)
        ? [trigger]
        : ["comment", "dm_keyword", "story_mention", "story_reply"];

  const { data, error } = await admin
    .from("instagram_automations")
    .select(AUTOMATION_COLUMNS)
    .eq("user_id", userId)
    .in("trigger_type", triggers)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    const setupRequired = isSetupError(error.code);
    return jsonError(
      setupRequired ? SETUP_MESSAGE : "اتوماسیون‌ها بارگذاری نشدند.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({
    account,
    automations: ((data as AutomationRow[] | null) ?? []).map(toAutomation),
  });
};

/** POST /api/instagram/automations — create a rule. */
export const POST = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const body = await readBody(request);
  if (!body) return jsonError("اطلاعات قابل خواندن نیست.", 400);

  const resolved = await requireConnection();
  if ("error" in resolved) return resolved.error;

  const { account, admin, userId } = resolved;
  if (!account) {
    return jsonError("ابتدا حساب اینستاگرام خود را وصل کنید.", 400);
  }

  const parsed = parseDraft(body);
  if ("message" in parsed) return jsonError(parsed.message, 400);

  // A comment rule on a connection without the comment permission would save
  // fine and then never fire, which is the worst outcome available. Refuse at
  // the point of saving and say what to do about it.
  if (parsed.draft.triggerType === "comment" && !account.canManageComments) {
    return jsonError(
      "برای اتوماسیون کامنت، یک‌بار دیگر حساب اینستاگرام را وصل کنید تا دسترسی کامنت‌ها داده شود.",
      403
    );
  }

  const { data, error } = await admin
    .from("instagram_automations")
    .insert({
      user_id: userId,
      instagram_connection_id: account.id,
      trigger_type: parsed.draft.triggerType,
      phrase: parsed.draft.phrase,
      phrase_normalized: parsed.draft.phraseNormalized,
      match_type: parsed.draft.matchType,
      media_id: parsed.draft.mediaId,
      reply_text: parsed.draft.replyText,
      public_reply_text: parsed.draft.publicReplyText,
    })
    .select(AUTOMATION_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError("برای این عبارت و همین پست، قانونی وجود دارد.", 409);
    }
    const setupRequired = isSetupError(error.code);
    return jsonError(
      setupRequired ? SETUP_MESSAGE : "اتوماسیون ذخیره نشد.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  // Re-arm the field subscription on every save, the same way the Telegram
  // route re-arms its webhook: an account connected before this feature existed
  // is subscribed to nothing, and the owner has no way to discover that.
  const webhookActive = await activateInstagramWebhook({
    connectionId: account.id,
    userId,
  });

  return NextResponse.json({
    automation: toAutomation(data as AutomationRow),
    webhookActive,
  });
};
