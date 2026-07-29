import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps the Supabase session fresh on every request (token refresh writes
 * back to cookies) and redirects signed-in users away from /auth.
 *
 * Runs on the Node.js runtime — `proxy` does not support the edge runtime.
 */
export const proxy = async (request: NextRequest) => {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Without credentials (e.g. fresh clone) just pass through.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not run code between createServerClient and getUser() — it can cause
  // random logouts (per Supabase SSR docs).
  //
  // getUser() validates the token against the Supabase server. That network
  // round-trip can hang for ~30s on a bad connection, which would block every
  // dashboard navigation — so we give it a strict time budget and fall back
  // to the locally-stored cookie session the moment it's exceeded.
  const NETWORK_BUDGET_MS = 2500;
  let signedIn = false;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), NETWORK_BUDGET_MS)
      ),
    ]);
    if (result === "timeout") {
      // Too slow — trust the cookie session (local read, no network).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      signedIn = !!session;
    } else if (result.data.user) {
      signedIn = true;
    } else if (
      result.error &&
      result.error.status !== 401 &&
      result.error.status !== 403
    ) {
      // Network-ish failure (not an auth rejection) — trust local cookies.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      signedIn = !!session;
    }
  } catch {
    // Supabase fully unreachable — trust the locally-stored session.
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      signedIn = !!session;
    } catch {
      return response;
    }
  }

  const { pathname } = request.nextUrl;

  // Signed-in users continue through onboarding; completed profiles are
  // redirected to the dashboard by the onboarding server page.
  if (signedIn && pathname.startsWith("/auth")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/onboarding";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Onboarding and the dashboard require a session.
  if (
    !signedIn &&
    (pathname.startsWith("/onboarding") || pathname.startsWith("/dashboard"))
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
};

export const config = {
  // Only the routes that care about the session — static assets skipped.
  matcher: ["/auth/:path*", "/onboarding/:path*", "/dashboard/:path*"],
};
