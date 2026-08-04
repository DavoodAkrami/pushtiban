import "server-only";

// ---------------------------------------------------------------------------
// Business Login for Instagram — the OAuth half of "Instagram API with
// Instagram Login". This flow authenticates against instagram.com directly, so
// the business owner never needs a linked Facebook Page.
//
// https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
//
// Credentials come from App Dashboard -> Instagram -> API setup with Instagram
// login. They are the *Instagram* app id and secret, which are not the same
// pair as the Facebook app id and secret under App settings -> Basic.
// ---------------------------------------------------------------------------

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_HOST = "https://graph.instagram.com";
const GRAPH_VERSION = "v23.0";

const REQUEST_TIMEOUT_MS = 8_000;

// instagram_business_basic is what keeps a long-lived token refreshable, so it
// is not optional even though the connection itself only reads the profile.
// The other two are what the automations need: messages to answer a direct
// message or send a private reply, comments to read comments and post public
// replies under them.
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;

/** Granted scope required by everything on the comment side of the channel. */
export const COMMENT_SCOPE = "instagram_business_manage_comments";

/**
 * Whether a stored connection was granted the comment permission.
 *
 * Accounts connected before comment automation shipped consented to a shorter
 * list, and their token simply will not work for comments — Meta rejects the
 * call rather than degrading. The `scopes` column exists so the dashboard can
 * say "reconnect to turn comments on" instead of showing a rule that quietly
 * never fires.
 */
export const hasCommentScope = (scopes: string | null | undefined) =>
  (scopes ?? "").split(/[\s,]+/).includes(COMMENT_SCOPE);

export type InstagramProfile = {
  userId: string;
  username: string;
  name: string;
  profilePictureUrl: string | null;
  accountType: string;
};

export type InstagramToken = {
  accessToken: string;
  /** Absolute expiry, already resolved from Meta's relative `expires_in`. */
  expiresAt: Date;
};

/** Thrown for every failure worth telling the business owner about. */
export class InstagramOAuthError extends Error {
  readonly reason: InstagramErrorReason;

  constructor(reason: InstagramErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "InstagramOAuthError";
    this.reason = reason;
  }
}

export type InstagramErrorReason =
  | "not_configured"
  | "invalid_state"
  | "exchange_failed"
  | "profile_failed"
  | "not_business"
  | "network"
  | "save_failed";

const appId = () => {
  const value = process.env.INSTAGRAM_APP_ID?.trim();
  if (!value) throw new InstagramOAuthError("not_configured");
  return value;
};

const appSecret = () => {
  const value = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!value) throw new InstagramOAuthError("not_configured");
  return value;
};

/**
 * The redirect URI Meta will send the browser back to. Meta matches this string
 * exactly against the app's allow-list, so it is derived from one place and
 * must be registered verbatim in App Dashboard -> Instagram -> Business login
 * settings -> OAuth redirect URIs.
 *
 * `requestUrl` is the fallback for deployments that have not set
 * NEXT_PUBLIC_SITE_URL, matching how the Telegram webhook URL is built.
 */
export const instagramRedirectUri = (requestUrl: string) => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = configured || new URL(requestUrl).origin;
  const redirect = new URL("/api/instagram/callback", base);

  // Meta rejects plain http, and a silent mismatch here surfaces much later as
  // an opaque "invalid redirect_uri" on Instagram's own screen.
  if (redirect.protocol !== "https:") {
    throw new InstagramOAuthError(
      "not_configured",
      "Instagram requires an https redirect URI; set NEXT_PUBLIC_SITE_URL."
    );
  }

  return redirect.toString();
};

export const buildAuthorizeUrl = ({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}) => {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", appId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
};

const fetchWithTimeout = async (input: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new InstagramOAuthError("network", "Instagram timed out.");
    }
    throw new InstagramOAuthError("network", "Instagram is unreachable.");
  } finally {
    clearTimeout(timeout);
  }
};

const readJson = async <T>(response: Response, reason: InstagramErrorReason) => {
  if (!response.ok) throw new InstagramOAuthError(reason);
  try {
    return (await response.json()) as T;
  } catch {
    throw new InstagramOAuthError(reason);
  }
};

/**
 * Authorization code -> short-lived token (1 hour).
 *
 * Meta appends a literal "#_" to the code when it hands the browser back, and
 * the fragment survives into the query string often enough that stripping it
 * is not optional.
 */
export const exchangeCodeForToken = async ({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) => {
  const cleanCode = code.replace(/#_$/, "");

  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId(),
      client_secret: appSecret(),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: cleanCode,
    }).toString(),
  });

  const data = await readJson<{
    access_token?: string;
    user_id?: number | string;
    permissions?: string[] | string;
  }>(response, "exchange_failed");

  if (!data.access_token) throw new InstagramOAuthError("exchange_failed");

  const permissions = Array.isArray(data.permissions)
    ? data.permissions.join(" ")
    : (data.permissions ?? "");

  return { shortLivedToken: data.access_token, permissions };
};

/** Short-lived token -> long-lived token (60 days). */
export const exchangeForLongLivedToken = async (
  shortLivedToken: string
): Promise<InstagramToken> => {
  const url = new URL(`${GRAPH_HOST}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret());
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetchWithTimeout(url.toString());
  const data = await readJson<{ access_token?: string; expires_in?: number }>(
    response,
    "exchange_failed"
  );

  if (!data.access_token) throw new InstagramOAuthError("exchange_failed");

  return {
    accessToken: data.access_token,
    expiresAt: expiryFrom(data.expires_in),
  };
};

/**
 * Extends a long-lived token by another 60 days. Meta only allows this while
 * the token is unexpired and at least 24 hours old; outside that window the
 * business owner has to reconnect.
 */
export const refreshLongLivedToken = async (
  longLivedToken: string
): Promise<InstagramToken> => {
  const url = new URL(`${GRAPH_HOST}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", longLivedToken);

  const response = await fetchWithTimeout(url.toString());
  const data = await readJson<{ access_token?: string; expires_in?: number }>(
    response,
    "exchange_failed"
  );

  if (!data.access_token) throw new InstagramOAuthError("exchange_failed");

  return {
    accessToken: data.access_token,
    expiresAt: expiryFrom(data.expires_in),
  };
};

export const fetchProfile = async (
  accessToken: string
): Promise<InstagramProfile> => {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/me`);
  url.searchParams.set(
    "fields",
    "user_id,username,name,profile_picture_url,account_type"
  );
  url.searchParams.set("access_token", accessToken);

  const response = await fetchWithTimeout(url.toString());
  const data = await readJson<{
    user_id?: string;
    id?: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    account_type?: string;
  }>(response, "profile_failed");

  const userId = data.user_id ?? data.id;
  if (!userId || !data.username) {
    throw new InstagramOAuthError("profile_failed");
  }

  return {
    userId: String(userId),
    username: data.username,
    name: data.name?.trim() || data.username,
    profilePictureUrl: data.profile_picture_url ?? null,
    accountType: data.account_type ?? "",
  };
};

// Meta returns seconds; a missing value falls back to the documented 60 days
// rather than leaving the column null and the refresh scheduler blind.
const expiryFrom = (expiresIn: number | undefined) => {
  const seconds = typeof expiresIn === "number" && expiresIn > 0
    ? expiresIn
    : 60 * 24 * 60 * 60;
  return new Date(Date.now() + seconds * 1_000);
};
