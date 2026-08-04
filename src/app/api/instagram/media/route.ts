import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { listMedia } from "@/lib/instagram/api";
import { jsonError, requireConnection } from "@/lib/instagram/automations-api";

export const runtime = "nodejs";

/**
 * GET /api/instagram/media — recent posts, for the "which post should this rule
 * watch?" picker.
 *
 * A thin proxy over the Graph call, and deliberately so: the access token never
 * leaves the server, and the browser gets only the fields the picker renders.
 * Returns an empty list rather than an error when Meta declines, so the editor
 * falls back to "every post" instead of blocking on a list it does not need.
 */
export const GET = async () => {
  const resolved = await requireConnection();
  if ("error" in resolved) return resolved.error;

  const { account, admin } = resolved;
  if (!account) return NextResponse.json({ media: [] });

  const { data } = await admin
    .from("instagram_connections")
    .select("token_ciphertext")
    .eq("id", account.id)
    .maybeSingle();

  const row = data as { token_ciphertext: string } | null;
  if (!row) return NextResponse.json({ media: [] });

  let token = "";
  try {
    token = decryptSecret(row.token_ciphertext);
  } catch {
    return jsonError("توکن اینستاگرام قابل خواندن نیست؛ دوباره وصل شوید.", 500);
  }

  const media = await listMedia({ token });
  return NextResponse.json({ media: media ?? [] });
};
