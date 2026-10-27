import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

// detectSessionInUrl defaults to true, which meant ANY client created
// anywhere on ANY page (e.g. Sidebar - mounted globally in
// app/layout.tsx, even on pages it hides itself on) would silently
// consume an invite/recovery link's #access_token hash the moment it
// mounted, before app/auth/callback's own explicit setSession logic
// ever ran. That's why a recovery link opened while already signed in
// elsewhere in the app landed straight in the app instead of showing
// "Set your password" - the ambient Sidebar client grabbed the token
// first. Only app/auth/callback should ever process that hash, and it
// already does so explicitly - so auto-detection is disabled here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: false,
        // Was "pkce" - reverted (confirmed live: a real password-reset
        // click failed with "PKCE code verifier not found in storage")
        // because PKCE's ?code= can only ever be exchanged in the exact
        // browser that called resetPasswordForEmail - the verifier lives
        // in THAT browser's own storage, nowhere else. Requesting a
        // reset on a laptop and opening the email on a phone (a normal,
        // common thing to do) always fails, not just occasionally.
        // "implicit" (the library default) goes back to the classic
        // #access_token hash, which carries everything it needs and
        // works from any device/browser - the scanner-prefetch problem
        // PKCE was solving for is instead handled where it actually
        // needs to be, in app/auth/callback itself: it no longer calls
        // setSession() just from the page loading, only from an explicit
        // "Continue" click, so a passive visit (human or bot) can't
        // consume the link before a real click does.
        flowType: "implicit",
      },
    }
  );
}

// resetPasswordForEmail() ONLY - never use this for sign-in/sign-out/
// session management, which must keep going through createClient() above
// so middleware.ts's cookie-based session check keeps working.
//
// createClient() above still sends PKCE's code_challenge regardless of
// the flowType option it's given: @supabase/ssr's createBrowserClient()
// hardcodes flowType: "pkce" (and detectSessionInUrl: true) INSIDE its
// own auth options object, placed after it spreads in whatever options
// are passed to it - so any flowType this file requests is silently
// thrown away before supabase-js ever sees it. Confirmed by reading
// node_modules/@supabase/ssr/dist/main/createBrowserClient.js directly -
// this isn't a config mistake, the override is unconditional in this
// library version (0.4.1) and can't be worked around through its own
// options. The result was every reset link's /auth/v1/recover request
// still carrying a code_challenge no matter what flowType.ts said,
// because createBrowserClient() was never actually honoring it.
//
// This client bypasses @supabase/ssr entirely and talks to supabase-js
// directly, which does respect flowType. It has no session to persist
// (persistSession: false) since its only job is to trigger the reset
// email send - it never needs cookies, storage, or auth-state
// listeners, so none of that is wired up here.
export function createAuthActionClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: false,
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
