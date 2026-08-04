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
import { activateInstagramWebhook } from "@/lib/instagram/webhook";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/instagram/automations/[id]
 *
 * Two shapes in one handler, matching the Telegram route: `{ isActive }` alone
 * is the card's toggle, anything else is a full edit from the modal.
 */
export const PATCH = async (request: NextRequest, context: RouteContext) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return jsonError("شناسه اتوماسیون معتبر نیست.", 400);

  const body = await readBody(request);
  if (!body) return jsonError("اطلاعات قابل خواندن نیست.", 400);

  const resolved = await requireConnection();
  if ("error" in resolved) return resolved.error;

  const { account, admin, userId } = resolved;
  if (!account) return jsonError("اتصال اینستاگرام پیدا نشد.", 404);

  const onlyToggling =
    typeof body.isActive === "boolean" &&
    body.triggerType === undefined &&
    body.replyText === undefined;

  let changes: Record<string, unknown>;

  if (onlyToggling) {
    changes = { is_active: body.isActive };
  } else {
    const parsed = parseDraft(body);
    if ("message" in parsed) return jsonError(parsed.message, 400);

    if (parsed.draft.triggerType === "comment" && !account.canManageComments) {
      return jsonError(
        "برای اتوماسیون کامنت، یک‌بار دیگر حساب اینستاگرام را وصل کنید تا دسترسی کامنت‌ها داده شود.",
        403
      );
    }

    changes = {
      trigger_type: parsed.draft.triggerType,
      phrase: parsed.draft.phrase,
      phrase_normalized: parsed.draft.phraseNormalized,
      match_type: parsed.draft.matchType,
      media_id: parsed.draft.mediaId,
      reply_text: parsed.draft.replyText,
      public_reply_text: parsed.draft.publicReplyText,
    };
    if (typeof body.isActive === "boolean") changes.is_active = body.isActive;
  }

  // Scoped by user_id as well as id: the id came from the browser, and the
  // composite key is what makes it harmless.
  const { data, error } = await admin
    .from("instagram_automations")
    .update(changes)
    .eq("id", id)
    .eq("user_id", userId)
    .select(AUTOMATION_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return jsonError("برای این عبارت و همین پست، قانونی وجود دارد.", 409);
    }
    const setupRequired = isSetupError(error.code);
    return jsonError(
      setupRequired ? SETUP_MESSAGE : "تغییرات ذخیره نشد.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }
  if (!data) return jsonError("اتوماسیون پیدا نشد.", 404);

  const webhookActive = await activateInstagramWebhook({
    connectionId: account.id,
    userId,
  });

  return NextResponse.json({
    automation: toAutomation(data as AutomationRow),
    webhookActive,
  });
};

/** DELETE /api/instagram/automations/[id] */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return jsonError("شناسه اتوماسیون معتبر نیست.", 400);

  const resolved = await requireConnection();
  if ("error" in resolved) return resolved.error;

  const { admin, userId } = resolved;

  const { error } = await admin
    .from("instagram_automations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    const setupRequired = isSetupError(error.code);
    return jsonError(
      setupRequired ? SETUP_MESSAGE : "اتوماسیون حذف نشد.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  return NextResponse.json({ ok: true });
};
