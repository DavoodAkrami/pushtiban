import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List the signed-in user's knowledge sources (title + chunk count) so the
 * RAG playground can show what has been ingested and optionally target one.
 */
export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("knowledge_sources")
      .select("id, title, source_type, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      const setupRequired = ["42P01", "42703", "PGRST204", "PGRST205"].includes(
        error.code
      );
      return NextResponse.json(
        { error: error.message, setupRequired },
        { status: setupRequired ? 503 : 500 }
      );
    }

    return NextResponse.json({ sources: data ?? [] });
  } catch {
    return NextResponse.json({ error: "List failed" }, { status: 500 });
  }
};
