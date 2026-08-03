import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { refreshLongLivedToken } from "@/lib/instagram/oauth";

// ---------------------------------------------------------------------------
// Reading and keeping alive the row in public.instagram_connections.
//
// Long-lived Instagram tokens last 60 days and can only be extended while they
// are still valid and at least 24 hours old. Miss that window and the business
// owner has to walk the whole consent flow again, so the token is topped up
// opportunistically whenever the connection is read.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Meta's floor: a token younger than this cannot be refreshed at all. */
const MIN_AGE_MS = DAY_MS;

/** Refresh this far ahead of expiry, leaving room for a stretch of downtime. */
const REFRESH_WINDOW_MS = 10 * DAY_MS;

export type InstagramConnection = {
  id: string;
  instagramUserId: string;
  username: string;
  accountName: string;
  profilePictureUrl: string | null;
  accountType: string;
  status: string;
  tokenExpiresAt: string;
  connectedAt: string;
};

const SELECT_COLUMNS =
  "id, instagram_user_id, username, account_name, profile_picture_url, account_type, status, token_expires_at, connected_at, updated_at, token_ciphertext";

type ConnectionRow = {
  id: string;
  instagram_user_id: string;
  username: string;
  account_name: string;
  profile_picture_url: string | null;
  account_type: string;
  status: string;
  token_expires_at: string;
  connected_at: string;
  updated_at: string;
  token_ciphertext: string;
};

const toConnection = (row: ConnectionRow): InstagramConnection => ({
  id: row.id,
  instagramUserId: row.instagram_user_id,
  username: row.username,
  accountName: row.account_name,
  profilePictureUrl: row.profile_picture_url,
  accountType: row.account_type,
  status: row.status,
  tokenExpiresAt: row.token_expires_at,
  connectedAt: row.connected_at,
});

/**
 * The caller's Instagram connection, or null. Requires a service-role client:
 * instagram_connections is policy-free by design.
 */
export const getInstagramConnection = async (
  admin: SupabaseClient,
  userId: string
): Promise<InstagramConnection | null> => {
  const { data } = await admin
    .from("instagram_connections")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<ConnectionRow>();

  if (!data) return null;

  const refreshed = await refreshIfExpiringSoon(admin, userId, data);
  return toConnection(refreshed);
};

/**
 * Extends the stored token when it is inside the refresh window. Returns the
 * row either way — a failed refresh marks the connection as `error` so the UI
 * can ask for a reconnect, but it never takes the screen down.
 */
const refreshIfExpiringSoon = async (
  admin: SupabaseClient,
  userId: string,
  row: ConnectionRow
): Promise<ConnectionRow> => {
  const expiresAt = new Date(row.token_expires_at).getTime();
  const issuedAt = new Date(row.updated_at).getTime();
  const now = Date.now();

  if (Number.isNaN(expiresAt) || Number.isNaN(issuedAt)) return row;

  const tooYoung = now - issuedAt < MIN_AGE_MS;
  const stillFresh = expiresAt - now > REFRESH_WINDOW_MS;
  if (tooYoung || stillFresh) return row;

  // Already expired: no refresh is possible, only a full reconnect.
  if (expiresAt <= now) {
    if (row.status !== "error") {
      await admin
        .from("instagram_connections")
        .update({ status: "error" })
        .eq("user_id", userId);
    }
    return { ...row, status: "error" };
  }

  try {
    const token = await refreshLongLivedToken(
      decryptSecret(row.token_ciphertext)
    );
    const tokenCiphertext = encryptSecret(token.accessToken);
    const tokenExpiresAt = token.expiresAt.toISOString();

    const { error } = await admin
      .from("instagram_connections")
      .update({
        token_ciphertext: tokenCiphertext,
        token_expires_at: tokenExpiresAt,
        status: "verified",
      })
      .eq("user_id", userId);

    if (error) return row;

    return {
      ...row,
      token_ciphertext: tokenCiphertext,
      token_expires_at: tokenExpiresAt,
      status: "verified",
    };
  } catch {
    return row;
  }
};
