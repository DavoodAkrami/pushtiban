import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same codes GET /api/inbox treats as "inbox.sql has not been run yet".
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

/**
 * GET /api/inbox/count — how many conversations are still open.
 *
 * Deliberately separate from GET /api/inbox: the top bar badge mounts on every
 * dashboard route and only needs an integer, so this asks Postgres to count
 * rather than pulling up to 100 conversation rows on every navigation.
 *
 * Every failure degrades to `count: null` with a 200. The badge is ambient
 * information — an unconfigured inbox or a hiccup should leave it hidden, never
 * surface an error next to the user's avatar.
 */
export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: null }, { status: 401 });

  const { count, error } = await supabase
    .from("support_conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "open");

  if (error) {
    return NextResponse.json({
      count: null,
      setupRequired: SETUP_ERROR_CODES.has(error.code),
    });
  }

  return NextResponse.json({ count: count ?? 0 });
};
