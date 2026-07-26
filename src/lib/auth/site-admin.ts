import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SiteAdminCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 };

/**
 * Resolve the signed-in user and verify the site-admin flag on their
 * profile. Route handlers translate `{ ok: false }` into a Persian 401/403.
 */
export const requireSiteAdmin = async (): Promise<SiteAdminCheck> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_admin !== true) return { ok: false, status: 403 };
  return { ok: true, userId: user.id };
};
