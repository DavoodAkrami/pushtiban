import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildAuthorizeUrl,
  instagramRedirectUri,
  InstagramOAuthError,
} from "@/lib/instagram/oauth";
import {
  appOrigin,
  buildReturnUrl,
  isReturnTarget,
  OAUTH_STATE_COOKIE,
  type InstagramReturnTarget,
} from "@/lib/instagram/return-target";

export const runtime = "nodejs";

const STATE_TTL_SECONDS = 10 * 60;

/**
 * Starts Business Login for Instagram. The browser is sent to Instagram's
 * consent screen with a one-time `state`, which is mirrored into an httpOnly
 * cookie so the callback can prove the response belongs to this session.
 *
 * The cookie also carries which screen opened the flow, because the round trip
 * leaves the app and the callback has no other way to find its way back.
 */
export const GET = async (request: NextRequest) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth", appOrigin(request.url)));
  }

  const requested = request.nextUrl.searchParams.get("return");
  const target: InstagramReturnTarget = isReturnTarget(requested)
    ? requested
    : "settings";

  let authorizeUrl: string;
  try {
    const redirectUri = instagramRedirectUri(request.url);
    const state = randomBytes(24).toString("base64url");

    authorizeUrl = buildAuthorizeUrl({ redirectUri, state });

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: `${state}.${target}`,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    const reason =
      error instanceof InstagramOAuthError ? error.reason : "network";
    return NextResponse.redirect(
      new URL(buildReturnUrl(target, "error", reason), appOrigin(request.url))
    );
  }
};
