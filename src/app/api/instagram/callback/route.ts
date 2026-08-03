import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto/secret-box";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchProfile,
  instagramRedirectUri,
  InstagramOAuthError,
  type InstagramErrorReason,
} from "@/lib/instagram/oauth";
import {
  appOrigin,
  buildReturnUrl,
  isReturnTarget,
  OAUTH_STATE_COOKIE,
  type InstagramReturnTarget,
} from "@/lib/instagram/return-target";

export const runtime = "nodejs";

const constantTimeEquals = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

/**
 * Where Instagram sends the browser after the consent screen. Everything that
 * can go wrong here ends as a redirect back to the screen that started the
 * flow, carrying a reason — a business owner should never be shown a raw JSON
 * error page for pressing "connect".
 */
export const GET = async (request: NextRequest) => {
  const cookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? "";
  const separator = cookie.lastIndexOf(".");
  const expectedState = separator > 0 ? cookie.slice(0, separator) : "";
  const storedTarget = separator > 0 ? cookie.slice(separator + 1) : "";
  const target: InstagramReturnTarget = isReturnTarget(storedTarget)
    ? storedTarget
    : "settings";

  const finish = (
    outcome: "connected" | "error" | "cancelled",
    reason?: string
  ) => {
    const response = NextResponse.redirect(
      new URL(buildReturnUrl(target, outcome, reason), appOrigin(request.url))
    );
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  };

  const params = request.nextUrl.searchParams;

  // Declining on Instagram's screen is a decision, not a failure: it returns
  // the owner to where they were with nothing to dismiss.
  const oauthError = params.get("error");
  if (oauthError) {
    return oauthError === "access_denied"
      ? finish("cancelled")
      : finish("error", "denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !expectedState) {
    return finish("error", "invalid_state");
  }
  if (!constantTimeEquals(state, expectedState)) {
    return finish("error", "invalid_state");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth", appOrigin(request.url)));
  }

  try {
    const redirectUri = instagramRedirectUri(request.url);
    const { shortLivedToken, permissions } = await exchangeCodeForToken({
      code,
      redirectUri,
    });
    const token = await exchangeForLongLivedToken(shortLivedToken);
    const profile = await fetchProfile(token.accessToken);

    const admin = createAdminClient();
    const { error } = await admin.from("instagram_connections").upsert(
      {
        user_id: user.id,
        instagram_user_id: profile.userId,
        username: profile.username,
        account_name: profile.name,
        profile_picture_url: profile.profilePictureUrl,
        account_type: profile.accountType,
        token_ciphertext: encryptSecret(token.accessToken),
        token_expires_at: token.expiresAt.toISOString(),
        scopes: permissions,
        status: "verified",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      // 23505 on instagram_user_id: the account is already serving another
      // business, which is a different problem from a failed write.
      return finish("error", error.code === "23505" ? "taken" : "save_failed");
    }

    return finish("connected");
  } catch (error) {
    const reason: InstagramErrorReason =
      error instanceof InstagramOAuthError ? error.reason : "network";
    return finish("error", reason);
  }
};
