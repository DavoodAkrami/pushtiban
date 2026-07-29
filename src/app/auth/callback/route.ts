import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const safeNextPath = (value: string | null) =>
  value?.startsWith("/") && !value.startsWith("//") ? value : "/onboarding";

export const GET = async (request: NextRequest) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(nextPath, url.origin));
  }

  return NextResponse.redirect(new URL("/auth?error=confirmation", url.origin));
};
