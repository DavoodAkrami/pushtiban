import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/lib/crypto/secret-box";
import {
  exchangeGoogleSheetsCode,
  googleSheetsRedirectUri,
  GOOGLE_SHEETS_OAUTH_COOKIE,
  GoogleSheetsOAuthError,
} from "@/lib/business-data/google-sheets";
import { getBusinessDataContext } from "@/lib/business-data/server";

export const runtime = "nodejs";

const sameValue = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const GET = async (request: NextRequest) => {
  const cookie = request.cookies.get(GOOGLE_SHEETS_OAUTH_COOKIE)?.value ?? "";
  const separator = cookie.lastIndexOf(".");
  const expectedState = separator > 0 ? cookie.slice(0, separator) : "";
  const collectionId = separator > 0 ? cookie.slice(separator + 1) : "";
  const finish = (outcome: "connected" | "error" | "cancelled", reason?: string) => {
    const destination = new URL(`/dashboard/data/${collectionId || ""}/source`, request.url);
    destination.searchParams.set("google", outcome);
    if (reason) destination.searchParams.set("reason", reason);
    const response = NextResponse.redirect(destination);
    response.cookies.delete(GOOGLE_SHEETS_OAUTH_COOKIE);
    return response;
  };
  if (request.nextUrl.searchParams.get("error")) return finish("cancelled");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || !expectedState || !collectionId || !sameValue(state, expectedState)) {
    return finish("error", "invalid_state");
  }
  try {
    const context = await getBusinessDataContext();
    const { data: collection } = await context.admin
      .from("business_data_collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", context.user.id)
      .maybeSingle();
    if (!collection) return finish("error", "invalid_state");
    const token = await exchangeGoogleSheetsCode({ code, redirectUri: googleSheetsRedirectUri() });
    const { data: existing } = await context.admin
      .from("business_data_sources")
      .select("id")
      .eq("collection_id", collectionId)
      .eq("user_id", context.user.id)
      .eq("source_type", "google_sheets")
      .maybeSingle();
    const sourceId = typeof existing?.id === "string" ? existing.id : randomUUID();
    const { error: sourceError } = await context.admin
      .from("business_data_sources")
      .upsert({
        id: sourceId,
        user_id: context.user.id,
        collection_id: collectionId,
        name: "Google Sheets",
        source_type: "google_sheets",
        status: "pending",
        configuration: { connected: true },
        field_mapping: {},
        last_error: null,
      });
    if (sourceError) return finish("error", "save_failed");
    const { error: secretError } = await context.admin
      .from("business_data_source_secrets")
      .upsert({
        source_id: sourceId,
        user_id: context.user.id,
        collection_id: collectionId,
        secret_ciphertext: encryptSecret(JSON.stringify(token)),
        rotated_at: new Date().toISOString(),
      });
    if (secretError) return finish("error", "save_failed");
    return finish("connected");
  } catch (error) {
    const reason = error instanceof GoogleSheetsOAuthError ? error.reason : "network";
    return finish("error", reason);
  }
};
