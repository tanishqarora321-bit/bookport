import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
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
  const { pathname } = request.nextUrl;

  // /api/session/register does its own auth entirely, from the access_token
  // the client just got back from signInWithPassword - it has to, since this
  // device's session cookie hasn't necessarily propagated to this very
  // request yet. Nothing below would use the result of a getUser() call for
  // this path (isApi short-circuits the redirect, and the active_sessions
  // check explicitly skips it), so doing it anyway was a second wasted
  // round trip to Supabase on every single login.
  if (SESSION_CHECK_EXEMPT.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api");

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

  // Single-device login, checked by SESSION_COOKIE's own token rather than
  // by user id: whichever device last called /api/session/register (on
  // sign-in, or on setting a password from an invite/recovery link) is the
  // one "active" session for this account, and its token is the only one
  // left in active_sessions once it overwrites the previous row - every
  // other device's cookie stops matching anything there on its very next
  // request and gets signed out here. Checking by token (via a service-role
  // client, so it doesn't depend on RLS seeing an already-authenticated
  // request) rather than by user id means this doesn't need a verified user
  // first: it was previously gated behind a successful getUser() call,
  // which meant any hiccup there (a slow or flaky response from Supabase's
  // Auth server) surfaced as a bare "please sign in" instead of the actual,
  // more helpful reason. A request with no SESSION_COOKIE at all (never
  // signed in, or signed in before this feature shipped) is left alone
  // rather than locked out - it's handled by the ordinary
  // signed-out-entirely check below instead.
  if (!isPublic) {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (sessionToken) {
      const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const { data: owner } = await service.from("active_sessions").select("session_token").eq("session_token", sessionToken).maybeSingle();
      if (!owner) {
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
        const redirectResponse = NextResponse.redirect(loginUrl);
        for (const cookie of response.cookies.getAll()) {
          redirectResponse.cookies.set(cookie);
        }
        redirectResponse.cookies.delete(SESSION_COOKIE);
        return redirectResponse;
      }
    }
  }

  const { data: { user } } = await supabase.auth.getUser();

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

  // An already-signed-in visit to "/" (e.g. a brand-new tab typing the
  // bare domain while logged in elsewhere) used to fall through to
  // app/page.tsx's own redirect("/bookings") - a framework-level
  // redirect during rendering, not a plain HTTP one. That left the root
  // layout's anti-flash script (which sets the th-light/th-dark/
  // th-system class on <html> before paint - see app/layout.tsx) never
  // actually applying: confirmed live by opening a fresh tab to the
  // bare domain while already logged in and finding <html> had no theme
  // class at all, even seconds later, rendering the whole app colorless
  // (CSS custom properties like --nav all resolve to nothing without
  // it). A real HTTP redirect here, before Next ever renders anything -
  // exactly how the /login case above and the unauthenticated case below
  // already work - sidesteps that entirely.
  if (user && pathname === "/") {
    const bookingsUrl = request.nextUrl.clone();
    bookingsUrl.pathname = "/bookings";
    return NextResponse.redirect(bookingsUrl);
  }

  // Hand the already-verified user down to getCurrentProfile() (used by
  // nearly every page/route) via a request header, so it doesn't have to
  // make its own redundant getUser() round trip to Supabase for a token
  // this middleware just finished verifying - that was doubling the Auth
  // latency on every single page load. Rebuilt on the final request
  // headers (not the original request.headers) so it reflects whatever
  // the cookie get/set/remove callbacks above last settled on; cookies
  // already queued on `response` are carried over since they still need
  // to reach the browser.
  if (user) {
    const headersWithUser = new Headers(request.headers);
    headersWithUser.set("x-bp-user-id", user.id);
    headersWithUser.set("x-bp-user-email", user.email ?? "");
    const finalResponse = NextResponse.next({ request: { headers: headersWithUser } });
    for (const cookie of response.cookies.getAll()) {
      finalResponse.cookies.set(cookie);
    }
    return finalResponse;
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
