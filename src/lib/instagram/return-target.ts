// Where the browser lands after the Instagram consent screen hands it back.
// The OAuth round trip leaves the app entirely, so the screen that started it
// is remembered in the state cookie rather than guessed on the way back.

export type InstagramReturnTarget = "onboarding" | "settings" | "instagram";

const RETURN_PATHS: Record<InstagramReturnTarget, string> = {
  onboarding: "/onboarding",
  // The settings modal lives in the dashboard shell, which reopens it on the
  // اتصالات section when it sees this query.
  settings: "/dashboard/overview?settings=connections",
  instagram: "/dashboard/instagram",
};

export const OAUTH_STATE_COOKIE = "pushtiban_ig_oauth";

/**
 * The origin to build redirects against. Behind a TLS-terminating proxy the
 * incoming request URL can still be http, which would bounce the owner to an
 * insecure copy of the app, so the configured site URL wins when present.
 * Same rule as the Telegram webhook URL builder.
 */
export const appOrigin = (requestUrl: string) => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the request origin on a malformed value.
    }
  }
  return new URL(requestUrl).origin;
};

export const isReturnTarget = (
  value: unknown
): value is InstagramReturnTarget =>
  value === "onboarding" || value === "settings" || value === "instagram";

/**
 * A return path carrying the outcome of the connection attempt. The screens
 * read `instagram` to raise a toast and `reason` to explain a failure.
 */
export const buildReturnUrl = (
  target: InstagramReturnTarget,
  outcome: "connected" | "error" | "cancelled",
  reason?: string
) => {
  const path = RETURN_PATHS[target];
  const separator = path.includes("?") ? "&" : "?";
  const query = new URLSearchParams({ instagram: outcome });
  if (reason) query.set("reason", reason);
  return `${path}${separator}${query.toString()}`;
};
