import { cleanKeyword, normalizeKeyword } from "@/lib/automations";

// ---------------------------------------------------------------------------
// Types and matching shared by the Instagram API routes, the webhook and the
// dashboard panels. Client-safe on purpose — the editor imports the same
// validation the server enforces, so a rule that saves is a rule that fires.
//
// Persian normalization (ZWNJ, Arabic vs Persian ی/ک, case, whitespace) is not
// re-implemented here: it is one problem with one right answer, already solved
// in src/lib/automations.ts for Telegram.
// ---------------------------------------------------------------------------

/** Instagram's cap on a text message. Telegram allows 4096. */
export const INSTAGRAM_REPLY_MAX_LENGTH = 1_000;

/** Same 80 characters as a Telegram keyword — the column agrees. */
export const INSTAGRAM_PHRASE_MAX_LENGTH = 80;

/** Meta shows at most four ice breakers in an empty thread. */
export const ICE_BREAKERS_MAX_COUNT = 4;

/** Persistent menu entries we allow; Meta's own ceiling is higher but unusable. */
export const DM_MENU_MAX_COUNT = 5;

/** An ice breaker question, as Meta stores it. */
export const MENU_TITLE_MAX_LENGTH = 80;

/**
 * A persistent menu entry's label. Meta truncates these at 30 characters when
 * the profile is pushed, so the editor stops there too — a label the owner can
 * see in full is the point of the menu.
 */
export const DM_MENU_TITLE_MAX_LENGTH = 30;

export const menuTitleMaxLength = (kind: "ice_breaker" | "menu") =>
  kind === "menu" ? DM_MENU_TITLE_MAX_LENGTH : MENU_TITLE_MAX_LENGTH;

export type InstagramTriggerType =
  | "comment"
  | "dm_keyword"
  | "story_mention"
  | "story_reply";

export type InstagramMatchType = "contains" | "exact";

export type InstagramAutomation = {
  id: string;
  triggerType: InstagramTriggerType;
  /** Null for story_mention, which has no customer text to match. */
  phrase: string | null;
  matchType: InstagramMatchType;
  /** Comment rules only. Null means every post. */
  mediaId: string | null;
  replyText: string;
  /** Comment rules only. Null means no public reply is posted. */
  publicReplyText: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InstagramAccountSummary = {
  id: string;
  username: string;
  name: string;
  status: string;
  /** False for accounts connected before comment automation shipped. */
  canManageComments: boolean;
};

export type InstagramMenuItem = {
  id: string;
  kind: "ice_breaker" | "menu";
  title: string;
  replyText: string;
  position: number;
};

export type InstagramDmMenu = {
  iceBreakersEnabled: boolean;
  persistentMenuEnabled: boolean;
  items: InstagramMenuItem[];
};

/** Rules whose trigger carries no phrase of its own. */
export const TRIGGERS_WITHOUT_PHRASE: InstagramTriggerType[] = ["story_mention"];

export const triggerNeedsPhrase = (trigger: InstagramTriggerType) =>
  !TRIGGERS_WITHOUT_PHRASE.includes(trigger);

/** Only comment rules can be scoped to a post or post a public reply. */
export const triggerSupportsMedia = (trigger: InstagramTriggerType) =>
  trigger === "comment";

export const triggerSupportsPublicReply = (trigger: InstagramTriggerType) =>
  trigger === "comment";

export const isInstagramTriggerType = (
  value: unknown
): value is InstagramTriggerType =>
  value === "comment" ||
  value === "dm_keyword" ||
  value === "story_mention" ||
  value === "story_reply";

export const isInstagramMatchType = (
  value: unknown
): value is InstagramMatchType => value === "contains" || value === "exact";

export { cleanKeyword as cleanPhrase, normalizeKeyword as normalizePhrase };

/**
 * The match type a trigger is allowed to use.
 *
 * A comment is prose — «سلام قیمت این چنده؟» — so a rule that only fired on the
 * bare word would never fire at all; `contains` is the default and `exact` is
 * available for owners who want it. A DM keyword is forced to `exact` so the
 * feature behaves identically to its Telegram twin, and so a rule on «سلام»
 * cannot swallow every greeting before the assistant sees it.
 */
export const resolveMatchType = (
  trigger: InstagramTriggerType,
  requested: InstagramMatchType
): InstagramMatchType => (trigger === "dm_keyword" ? "exact" : requested);

/**
 * Whether a customer's message or comment fires this rule.
 *
 * Both sides are normalized the same way, so «کیک» matches «كيك» typed with an
 * Arabic keyboard — which real customers in Iran do constantly.
 */
export const matchesPhrase = (
  text: string,
  rule: { phrase: string | null; matchType: InstagramMatchType }
): boolean => {
  // No phrase means the trigger itself is the whole condition (a story mention
  // fires on every mention), so anything matches.
  if (!rule.phrase) return true;

  const haystack = normalizeKeyword(text);
  const needle = normalizeKeyword(rule.phrase);
  if (!haystack || !needle) return false;

  return rule.matchType === "exact"
    ? haystack === needle
    : haystack.includes(needle);
};

/**
 * Pick the rule that should answer, from the rules already filtered to one
 * trigger type.
 *
 * A rule pinned to the post the comment is on beats a rule that watches every
 * post: the specific rule is the one the owner wrote *because* the general one
 * was not right for that post. Within a tier the longer phrase wins, so «قیمت
 * عمده» is not answered by the rule for «قیمت».
 */
export const selectMatchingRule = <
  T extends {
    phrase: string | null;
    matchType: InstagramMatchType;
    mediaId: string | null;
  },
>(
  rules: T[],
  { mediaId, text }: { mediaId?: string | null; text: string }
): T | null => {
  const matches = rules.filter(
    (rule) =>
      (rule.mediaId === null || rule.mediaId === mediaId) &&
      matchesPhrase(text, rule)
  );
  if (!matches.length) return null;

  return matches.sort((a, b) => {
    const specificity = Number(b.mediaId !== null) - Number(a.mediaId !== null);
    if (specificity !== 0) return specificity;
    return (b.phrase?.length ?? 0) - (a.phrase?.length ?? 0);
  })[0];
};

// ---- Menu payloads ---------------------------------------------------------

const MENU_PAYLOAD_PREFIX = "pushtiban_menu:";

/**
 * Ice breakers and menu entries come back through the webhook as an opaque
 * payload string rather than as their label, so the payload carries the item's
 * id and the webhook looks the reply up rather than trusting what was sent.
 */
export const buildMenuPayload = (itemId: string) =>
  `${MENU_PAYLOAD_PREFIX}${itemId}`;

export const parseMenuPayload = (payload: string): string | null =>
  payload.startsWith(MENU_PAYLOAD_PREFIX)
    ? payload.slice(MENU_PAYLOAD_PREFIX.length) || null
    : null;

// ---- Flow payloads ---------------------------------------------------------

const FLOW_PAYLOAD_PREFIX = "pushtiban_flow:";

/** A flow button whose only job is to close the path. */
export const FLOW_END_PAYLOAD = "pushtiban_flow_end";

/**
 * The payload behind a flow button.
 *
 * It carries the node being opened *and* the node it was opened from, because
 * that is the only way the next message can offer a back button: Instagram
 * gives us a postback and nothing else — no message to read, no history to walk
 * — so the trail has to travel in the payload. The Telegram webhook encodes the
 * same pair into its callback data, for the same reason.
 *
 * Meta allows 1000 characters here, and two UUIDs spend 73.
 */
export const buildFlowPayload = (targetNodeId: string, sourceNodeId?: string) =>
  `${FLOW_PAYLOAD_PREFIX}${targetNodeId}${
    sourceNodeId ? `:${sourceNodeId}` : ""
  }`;

export const parseFlowPayload = (
  payload: string
): { targetNodeId: string; sourceNodeId: string | null } | null => {
  if (!payload.startsWith(FLOW_PAYLOAD_PREFIX)) return null;

  const [targetNodeId, sourceNodeId, extra] = payload
    .slice(FLOW_PAYLOAD_PREFIX.length)
    .split(":");
  if (!targetNodeId || extra) return null;

  return { targetNodeId, sourceNodeId: sourceNodeId || null };
};
