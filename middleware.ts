import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Stage 2: now that real accounts exist and login/invite has been
// confirmed working end to end, this redirects signed-out visitors to
// /login instead of letting them straight into the app. /login,
// /auth/callback (invite/password-reset links) and /api/* (routes do
// their own auth via getCurrentProfile and return JSON, not an HTML
// redirect) stay reachable either way.
const PUBLIC_PATHS = ["/login", "/auth/callback"];
const SESSION_COOKIE = "bp_session";
// Always reachable regardless of which device is currently "active" -
// this is the endpoint a device calls to BECOME the active one.
const SESSION_CHECK_EXEMPT = ["/api/session/register"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api");

  if (!user && !isPublic && !isApi) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  // Single-device login: whichever device last called /api/session/register
  // (on sign-in, or on setting a password from an invite/recovery link) is
  // the one "active" session for this account - every other device's
  // cookie stops matching active_sessions.session_token on its very next
  // request and gets signed out here. A user with no active_sessions row
  // yet (already signed in before this shipped) is left alone rather than
  // locked out - they get enrolled the next time they actually log in.
  if (user && !isPublic && !SESSION_CHECK_EXEMPT.some((p) => pathname.startsWith(p))) {
    const { data: activeSession } = await supabase
      .from("active_sessions")
      .select("session_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (activeSession && activeSession.session_token !== request.cookies.get(SESSION_COOKIE)?.value) {
      await supabase.auth.signOut();
      if (isApi) {
        return NextResponse.json(
          { error: "You've been signed out because this account signed in on another device." },
          { status: 401 }
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("reason", "elsewhere");
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and Next internals - only real page/API requests
    // need the session refreshed.
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};
