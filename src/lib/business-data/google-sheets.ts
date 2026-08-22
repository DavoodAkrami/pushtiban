import "server-only";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 8_000;

export const GOOGLE_SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const GOOGLE_SHEETS_OAUTH_COOKIE = "pushtiban_google_sheets_oauth";

export type GoogleSheetsToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
};

export class GoogleSheetsOAuthError extends Error {
  reason: "not_configured" | "invalid_state" | "denied" | "exchange_failed" | "network";

  constructor(reason: GoogleSheetsOAuthError["reason"]) {
    super(reason);
    this.name = "GoogleSheetsOAuthError";
    this.reason = reason;
  }
}

const clientId = () => {
  const value = process.env.GOOGLE_SHEETS_OAUTH_CLIENT_ID?.trim();
  if (!value) throw new GoogleSheetsOAuthError("not_configured");
  return value;
};

const clientSecret = () => {
  const value = process.env.GOOGLE_SHEETS_OAUTH_CLIENT_SECRET?.trim();
  if (!value) throw new GoogleSheetsOAuthError("not_configured");
  return value;
};

export const googleSheetsRedirectUri = () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) throw new GoogleSheetsOAuthError("not_configured");
  const redirect = new URL("/api/business-data/google-sheets/callback", siteUrl);
  if (redirect.protocol !== "https:") throw new GoogleSheetsOAuthError("not_configured");
  return redirect.toString();
};

export const buildGoogleSheetsAuthorizeUrl = ({ redirectUri, state }: { redirectUri: string; state: string }) => {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SHEETS_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
};

const fetchWithTimeout = async (input: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
  } catch {
    throw new GoogleSheetsOAuthError("network");
  } finally {
    clearTimeout(timeout);
  }
};

export const exchangeGoogleSheetsCode = async ({ code, redirectUri }: { code: string; redirectUri: string }): Promise<GoogleSheetsToken> => {
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new GoogleSheetsOAuthError("exchange_failed");
  let payload: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  try {
    payload = await response.json();
  } catch {
    throw new GoogleSheetsOAuthError("exchange_failed");
  }
  if (typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string") {
    throw new GoogleSheetsOAuthError("exchange_failed");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: typeof payload.expires_in === "number" ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null,
  };
};
