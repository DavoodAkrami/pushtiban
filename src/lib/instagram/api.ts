import "server-only";

// ---------------------------------------------------------------------------
// Every Instagram Graph call the product makes, in one module.
//
// The counterpart of src/lib/instagram/oauth.ts: that file owns the login
// handshake, this one owns everything done with the token afterwards. Keeping
// them together is what makes a Meta API change a one-file edit.
//
// https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
//
// Two limits shape the whole file and are not ours to negotiate:
//   - A text message is capped at 1000 characters (Telegram allows 4096).
//   - A business may message a customer for 24 hours after that customer's
//     last message. The HUMAN_AGENT tag extends that to 7 days, which is the
//     only reason answering from the dashboard hours later works at all.
// ---------------------------------------------------------------------------

const GRAPH_HOST = "https://graph.instagram.com";
const GRAPH_VERSION = "v23.0";
const REQUEST_TIMEOUT_MS = 8_000;

/** Instagram truncates beyond this; we do it ourselves so nothing is lost silently. */
export const INSTAGRAM_MESSAGE_MAX_LENGTH = 1_000;

/** Comment replies are shorter still. */
export const INSTAGRAM_COMMENT_MAX_LENGTH = 1_000;

export type InstagramSenderAction = "typing_on" | "mark_seen";

export type InstagramMediaItem = {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
};

export type IceBreaker = { question: string; payload: string };
export type PersistentMenuItem = { title: string; payload: string };

/**
 * Every call here returns a boolean or null rather than throwing.
 *
 * The only caller that matters is the webhook, and a webhook that throws gets
 * retried by Meta — which for a rule that already delivered its DM means the
 * customer receives it twice. Failure is reported, logged, and swallowed.
 */
const graphFetch = async (
  url: string,
  init: RequestInit
): Promise<Response | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/** Logs the reason Meta gave, which is the difference between a fix and a guess. */
const reportFailure = async (response: Response | null, context: string) => {
  if (!response) {
    console.error(`Instagram ${context} failed: network error or timeout`);
    return false;
  }
  if (response.ok) return true;

  const body = await response.text().catch(() => "");
  console.error(
    `Instagram ${context} failed (${response.status}): ${body.slice(0, 300)}`
  );
  return false;
};

export const truncateInstagramMessage = (value: string) =>
  Array.from(value).slice(0, INSTAGRAM_MESSAGE_MAX_LENGTH).join("");

// ---- Messaging -------------------------------------------------------------

type MessageRecipient = { id: string } | { comment_id: string };

const postMessage = async ({
  body,
  context,
  igUserId,
  token,
}: {
  body: Record<string, unknown>;
  context: string;
  igUserId: string;
  token: string;
}) => {
  const response = await graphFetch(
    `${GRAPH_HOST}/${GRAPH_VERSION}/${encodeURIComponent(igUserId)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  );
  return reportFailure(response, context);
};

/**
 * A plain text reply to a customer. Valid only inside the 24-hour window that
 * opened with the customer's last message — which is exactly when the webhook
 * calls it, since the webhook fires *because* they just wrote.
 *
 * `quickReplies` renders the tappable chips under the message. They are
 * Instagram's nearest thing to Telegram's inline keyboard, with the important
 * difference that tapping one sends it as an ordinary message rather than a
 * callback that can edit what is already on screen.
 */
export const sendDirectMessage = async ({
  igUserId,
  quickReplies,
  recipientId,
  text,
  token,
}: {
  igUserId: string;
  quickReplies?: { title: string; payload: string }[];
  recipientId: string;
  text: string;
  token: string;
}) => {
  const message: Record<string, unknown> = {
    text: truncateInstagramMessage(text),
  };

  if (quickReplies?.length) {
    message.quick_replies = quickReplies.slice(0, 13).map((reply) => ({
      content_type: "text",
      // Instagram caps a chip's label at 20 characters and rejects the whole
      // message when one is longer, so the label is trimmed rather than risked.
      title: Array.from(reply.title).slice(0, 20).join(""),
      payload: reply.payload,
    }));
  }

  return postMessage({
    body: { recipient: { id: recipientId } as MessageRecipient, message },
    context: "sendDirectMessage",
    igUserId,
    token,
  });
};

/** One tappable button on a message. Meta allows three per template. */
export type InstagramTemplateButton =
  | { type: "postback"; title: string; payload: string }
  | { type: "web_url"; title: string; url: string };

/** Meta's cap on the text of a button template — lower than a plain message. */
export const INSTAGRAM_TEMPLATE_TEXT_MAX_LENGTH = 640;

/** Meta's caps on the buttons themselves. */
export const INSTAGRAM_TEMPLATE_BUTTONS_MAX = 3;
export const INSTAGRAM_BUTTON_LABEL_MAX_LENGTH = 20;

/**
 * A message with buttons attached to it — Instagram's nearest thing to
 * Telegram's inline keyboard, and what a flow message is delivered as.
 *
 * Quick replies would have been the other candidate and are the wrong tool
 * here: they cannot open a URL, and they vanish the moment the customer types
 * anything, which for a multi-step flow means the path disappears mid-
 * conversation. Template buttons stay attached to the message they belong to.
 *
 * Labels and text are trimmed rather than risked: Meta rejects the *whole*
 * message when one label is too long, and a flow that silently stops
 * delivering is worse than one whose button label lost its last two words.
 */
export const sendButtonTemplate = async ({
  buttons,
  igUserId,
  recipientId,
  text,
  token,
}: {
  buttons: InstagramTemplateButton[];
  igUserId: string;
  recipientId: string;
  text: string;
  token: string;
}) => {
  const trimmed = buttons
    .slice(0, INSTAGRAM_TEMPLATE_BUTTONS_MAX)
    .map((button) => ({
      ...button,
      title: Array.from(button.title)
        .slice(0, INSTAGRAM_BUTTON_LABEL_MAX_LENGTH)
        .join(""),
    }));

  // A template with no buttons is not a template Meta accepts; a plain message
  // is what the owner meant anyway.
  if (!trimmed.length) {
    return sendDirectMessage({ igUserId, recipientId, text, token });
  }

  return postMessage({
    body: {
      recipient: { id: recipientId } as MessageRecipient,
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: Array.from(text)
              .slice(0, INSTAGRAM_TEMPLATE_TEXT_MAX_LENGTH)
              .join(""),
            buttons: trimmed,
          },
        },
      },
    },
    context: "sendButtonTemplate",
    igUserId,
    token,
  });
};

/**
 * The private reply to a comment: a DM addressed by comment id rather than by
 * customer, which is what makes comment automation possible at all — the
 * business has no open messaging window with someone who has only commented.
 *
 * Two rules Meta enforces and we cannot: the comment must be less than 7 days
 * old, and **exactly one** private reply may ever be sent per comment. A second
 * attempt is rejected, so the caller's idempotency check is load-bearing.
 */
export const sendPrivateReply = async ({
  commentId,
  igUserId,
  text,
  token,
}: {
  commentId: string;
  igUserId: string;
  text: string;
  token: string;
}) =>
  postMessage({
    body: {
      recipient: { comment_id: commentId } as MessageRecipient,
      message: { text: truncateInstagramMessage(text) },
    },
    context: "sendPrivateReply",
    igUserId,
    token,
  });

/**
 * A reply sent by a human, hours or days after the customer wrote.
 *
 * The HUMAN_AGENT tag is what extends the window from 24 hours to 7 days, so
 * this — not sendDirectMessage — is what the dashboard inbox and the Telegram
 * mirror must use. Meta restricts the tag to genuine human responses, which is
 * precisely the case here.
 */
export const sendHumanAgentMessage = async ({
  igUserId,
  recipientId,
  text,
  token,
}: {
  igUserId: string;
  recipientId: string;
  text: string;
  token: string;
}) =>
  postMessage({
    body: {
      recipient: { id: recipientId } as MessageRecipient,
      message: { text: truncateInstagramMessage(text) },
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
    },
    context: "sendHumanAgentMessage",
    igUserId,
    token,
  });

/**
 * The typing indicator, and the read receipt. Instagram's equivalent of
 * sendChatAction, and used the same way: on before a slow AI completion, so the
 * customer sees the account is working rather than silent.
 */
export const setSenderAction = async ({
  action,
  igUserId,
  recipientId,
  token,
}: {
  action: InstagramSenderAction;
  igUserId: string;
  recipientId: string;
  token: string;
}) =>
  postMessage({
    body: {
      recipient: { id: recipientId } as MessageRecipient,
      sender_action: action,
    },
    context: `setSenderAction(${action})`,
    igUserId,
    token,
  });

/**
 * Run `task` with the typing indicator showing. Instagram's indicator lapses on
 * its own after a few seconds, so it is refreshed the way the Telegram webhook
 * refreshes sendChatAction.
 */
const TYPING_REFRESH_MS = 4_000;

export const withInstagramTyping = async <T>({
  igUserId,
  recipientId,
  task,
  token,
}: {
  igUserId: string;
  recipientId: string;
  task: () => Promise<T>;
  token: string;
}) => {
  const typing = () =>
    setSenderAction({ action: "typing_on", igUserId, recipientId, token });

  void typing();
  const refresh = setInterval(() => {
    void typing();
  }, TYPING_REFRESH_MS);

  try {
    return await task();
  } finally {
    clearInterval(refresh);
  }
};

// ---- Comments --------------------------------------------------------------

/**
 * A public reply posted under the customer's comment. Sent alongside the
 * private reply when the owner asked for one: it tells everyone else reading
 * the post that the account answers, which is the reason businesses want it.
 */
export const replyToComment = async ({
  commentId,
  text,
  token,
}: {
  commentId: string;
  text: string;
  token: string;
}) => {
  const body = new URLSearchParams({
    message: Array.from(text).slice(0, INSTAGRAM_COMMENT_MAX_LENGTH).join(""),
  });

  const response = await graphFetch(
    `${GRAPH_HOST}/${GRAPH_VERSION}/${encodeURIComponent(commentId)}/replies`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      body: body.toString(),
    }
  );
  return reportFailure(response, "replyToComment");
};

// ---- Media -----------------------------------------------------------------

type MediaResponse = {
  data?: {
    id?: string;
    caption?: string;
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
    timestamp?: string;
  }[];
};

/**
 * The account's recent posts, for the "which post should this rule watch?"
 * picker. Returns null on failure so the editor can fall back to all-posts
 * rather than presenting an empty list as though the account had no media.
 */
export const listMedia = async ({
  limit = 24,
  token,
}: {
  limit?: number;
  token: string;
}): Promise<InstagramMediaItem[] | null> => {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/me/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp"
  );
  url.searchParams.set("limit", String(limit));

  const response = await graphFetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!(await reportFailure(response, "listMedia")) || !response) return null;

  let payload: MediaResponse;
  try {
    payload = (await response.json()) as MediaResponse;
  } catch {
    return null;
  }

  return (payload.data ?? [])
    .filter((item): item is { id: string } & typeof item => Boolean(item.id))
    .map((item) => ({
      id: item.id,
      caption: item.caption ?? null,
      mediaType: item.media_type ?? "",
      mediaUrl: item.media_url ?? null,
      // A video has no media_url worth showing in a grid, but it does have a
      // poster frame.
      thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
      permalink: item.permalink ?? null,
      timestamp: item.timestamp ?? null,
    }));
};

// ---- Messenger profile (ice breakers + persistent menu) --------------------

/**
 * Push the account's ice breakers and persistent menu to Meta.
 *
 * Both live on the "messenger profile", a single document Meta stores per
 * account: sending an empty list is how a feature is turned off, which is why
 * this always writes both halves rather than patching one.
 */
export const putMessengerProfile = async ({
  iceBreakers,
  persistentMenu,
  token,
}: {
  iceBreakers: IceBreaker[];
  persistentMenu: PersistentMenuItem[];
  token: string;
}) => {
  const profile: Record<string, unknown> = { platform: "instagram" };

  profile.ice_breakers = iceBreakers.length
    ? [
        {
          locale: "default",
          call_to_actions: iceBreakers.slice(0, 4).map((breaker) => ({
            question: Array.from(breaker.question).slice(0, 80).join(""),
            payload: breaker.payload,
          })),
        },
      ]
    : [];

  profile.persistent_menu = persistentMenu.length
    ? [
        {
          locale: "default",
          composer_input_disabled: false,
          call_to_actions: persistentMenu.slice(0, 5).map((item) => ({
            type: "postback",
            title: Array.from(item.title).slice(0, 30).join(""),
            payload: item.payload,
          })),
        },
      ]
    : [];

  const response = await graphFetch(
    `${GRAPH_HOST}/${GRAPH_VERSION}/me/messenger_profile`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(profile),
    }
  );
  return reportFailure(response, "putMessengerProfile");
};

// ---- Webhook subscription --------------------------------------------------

/**
 * Subscribe this account to the webhook fields we handle.
 *
 * The callback URL itself is configured once in the App Dashboard and serves
 * every business; this is the per-account half, and without it a connected
 * account is authorized but silent.
 */
export const subscribeToWebhookFields = async ({
  fields,
  igUserId,
  token,
}: {
  fields: string[];
  igUserId: string;
  token: string;
}) => {
  const url = new URL(
    `${GRAPH_HOST}/${GRAPH_VERSION}/${encodeURIComponent(igUserId)}/subscribed_apps`
  );
  url.searchParams.set("subscribed_fields", fields.join(","));

  const response = await graphFetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return reportFailure(response, "subscribeToWebhookFields");
};
