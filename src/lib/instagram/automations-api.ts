import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  cleanPhrase,
  isInstagramMatchType,
  isInstagramTriggerType,
  normalizePhrase,
  resolveMatchType,
  triggerNeedsPhrase,
  triggerSupportsMedia,
  triggerSupportsPublicReply,
  INSTAGRAM_PHRASE_MAX_LENGTH,
  INSTAGRAM_REPLY_MAX_LENGTH,
  type InstagramAccountSummary,
  type InstagramAutomation,
  type InstagramMatchType,
  type InstagramTriggerType,
} from "@/lib/instagram/automations";
import { hasCommentScope } from "@/lib/instagram/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Shared plumbing for the Instagram dashboard routes.
//
// Route files may only export HTTP handlers and Next's own config fields, so
// everything the routes share lives here rather than being re-typed in each of
// them.
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 8_500;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export const SETUP_MESSAGE =
  "راه‌اندازی اتوماسیون اینستاگرام کامل نشده است؛ اسکریپت پایگاه داده را اجرا کنید.";

export const AUTOMATION_COLUMNS =
  "id, trigger_type, phrase, match_type, media_id, reply_text, public_reply_text, is_active, created_at, updated_at";

export type AutomationRow = {
  id: string;
  trigger_type: InstagramTriggerType;
  phrase: string | null;
  match_type: InstagramMatchType;
  media_id: string | null;
  reply_text: string;
  public_reply_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const toAutomation = (row: AutomationRow): InstagramAutomation => ({
  id: row.id,
  triggerType: row.trigger_type,
  phrase: row.phrase,
  matchType: row.match_type,
  mediaId: row.media_id,
  replyText: row.reply_text,
  publicReplyText: row.public_reply_text,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const jsonError = (
  error: string,
  status: number,
  setupRequired = false
) => NextResponse.json({ error, setupRequired }, { status });

export const isSetupError = (code: string | undefined) =>
  Boolean(code && SETUP_ERROR_CODES.has(code));

export const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export const readBody = async (
  request: NextRequest
): Promise<Record<string, unknown> | null> => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return null;
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Resolve the caller and their Instagram connection in one step.
 *
 * `src/proxy.ts` does not cover /api/*, so every route authenticates itself
 * with the anon client and then scopes the admin client by hand — the pattern
 * every other route in this repo repeats, and the reason a connection is never
 * looked up by an id the browser supplied.
 */
export const requireConnection = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401),
    } as const;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("instagram_connections")
    .select("id, username, account_name, status, scopes")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    const setupRequired = isSetupError(error.code);
    return {
      error: jsonError(
        setupRequired ? SETUP_MESSAGE : "اتصال اینستاگرام بارگذاری نشد.",
        setupRequired ? 503 : 500,
        setupRequired
      ),
    } as const;
  }

  const row = data as {
    id: string;
    username: string;
    account_name: string;
    status: string;
    scopes: string | null;
  } | null;

  const account: InstagramAccountSummary | null = row
    ? {
        id: row.id,
        username: row.username,
        name: row.account_name,
        status: row.status,
        canManageComments: hasCommentScope(row.scopes),
      }
    : null;

  return { account, admin, userId: user.id } as const;
};

// ---- Validation ------------------------------------------------------------

export type AutomationDraft = {
  triggerType: InstagramTriggerType;
  phrase: string | null;
  phraseNormalized: string | null;
  matchType: InstagramMatchType;
  mediaId: string | null;
  replyText: string;
  publicReplyText: string | null;
};

/**
 * Turn a request body into a saveable rule, or a Persian reason it is not one.
 *
 * These are the same rules the SQL check constraints enforce, restated here so
 * the owner gets a sentence instead of a Postgres error.
 */
export const parseDraft = (
  body: Record<string, unknown>
): { draft: AutomationDraft } | { message: string } => {
  const triggerType = body.triggerType;
  if (!isInstagramTriggerType(triggerType)) {
    return { message: "نوع محرک معتبر نیست." };
  }

  const requestedMatch = isInstagramMatchType(body.matchType)
    ? body.matchType
    : "contains";
  const matchType = resolveMatchType(triggerType, requestedMatch);

  let phrase: string | null = null;
  let phraseNormalized: string | null = null;

  if (triggerNeedsPhrase(triggerType)) {
    const rawPhrase = typeof body.phrase === "string" ? body.phrase : "";
    phrase = cleanPhrase(rawPhrase);
    phraseNormalized = normalizePhrase(rawPhrase);

    if (!phrase || !phraseNormalized) {
      return {
        message:
          triggerType === "comment"
            ? "عبارتی که باید در کامنت جست‌وجو شود را بنویسید."
            : "یک کلیدواژه وارد کنید.",
      };
    }
    if (phrase.length > INSTAGRAM_PHRASE_MAX_LENGTH) {
      return { message: "عبارت حداکثر ۸۰ نویسه است." };
    }
  }

  const replyText =
    typeof body.replyText === "string" ? body.replyText.trim() : "";
  if (!replyText) return { message: "متن دایرکت را بنویسید." };
  if (replyText.length > INSTAGRAM_REPLY_MAX_LENGTH) {
    return { message: "متن دایرکت حداکثر ۱۰۰۰ نویسه است." };
  }

  let mediaId: string | null = null;
  if (triggerSupportsMedia(triggerType) && typeof body.mediaId === "string") {
    const trimmed = body.mediaId.trim();
    // Media ids are numeric strings; anything else is a client bug or worse.
    if (trimmed && !/^\d{1,32}$/.test(trimmed)) {
      return { message: "شناسه پست معتبر نیست." };
    }
    mediaId = trimmed || null;
  }

  let publicReplyText: string | null = null;
  if (
    triggerSupportsPublicReply(triggerType) &&
    typeof body.publicReplyText === "string"
  ) {
    const trimmed = body.publicReplyText.trim();
    if (trimmed.length > INSTAGRAM_REPLY_MAX_LENGTH) {
      return { message: "متن پاسخ عمومی حداکثر ۱۰۰۰ نویسه است." };
    }
    publicReplyText = trimmed || null;
  }

  return {
    draft: {
      triggerType,
      phrase,
      phraseNormalized,
      matchType,
      mediaId,
      replyText,
      publicReplyText,
    },
  };
};
