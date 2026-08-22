import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getBusinessDataContext, getCollectionDetail } from "@/lib/business-data/server";
import {
  buildGoogleSheetsAuthorizeUrl,
  googleSheetsRedirectUri,
  GOOGLE_SHEETS_OAUTH_COOKIE,
  GoogleSheetsOAuthError,
} from "@/lib/business-data/google-sheets";

export const runtime = "nodejs";

export const GET = async (request: NextRequest) => {
  const collectionId = request.nextUrl.searchParams.get("collectionId");
  if (!collectionId) return NextResponse.redirect(new URL("/dashboard/data", request.url));
  try {
    const context = await getBusinessDataContext();
    await getCollectionDetail(context, collectionId);
    const state = randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(buildGoogleSheetsAuthorizeUrl({
      redirectUri: googleSheetsRedirectUri(),
      state,
    }));
    response.cookies.set({
      name: GOOGLE_SHEETS_OAUTH_COOKIE,
      value: `${state}.${collectionId}`,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const reason = error instanceof GoogleSheetsOAuthError ? error.reason : "not_configured";
    return NextResponse.redirect(new URL(`/dashboard/data/${collectionId}/source?google=error&reason=${reason}`, request.url));
  }
};
