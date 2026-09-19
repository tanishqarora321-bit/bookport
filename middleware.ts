import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Groundwork only, stage 1: this refreshes a logged-in user's session
// cookie on every request so it doesn't silently expire. It does NOT
// redirect anyone yet - every page still works exactly as before
// (service-role + DEFAULT_COMPANY_ID). Route-protection (redirect to
// /login when signed out) is a deliberate separate step, added only
// once real accounts exist and login has been confirmed working -
// turning it on before that would lock everyone out of the app.
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

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and Next internals - only real page/API requests
    // need the session refreshed.
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};
