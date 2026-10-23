import { createBrowserClient } from "@supabase/ssr";

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
        // resetPasswordForEmail's link otherwise carries the session
        // straight in the URL (#access_token=...), which is "live" the
        // instant the link exists - an email client or security scanner
        // that pre-fetches links to check for phishing (Gmail and
        // Outlook both do this) visits it before the person ever
        // clicks, silently burning the one-time code and leaving them
        // with "invalid or has expired" on the real click. PKCE's link
        // instead carries an opaque ?code= that's useless without the
        // verifier this browser stashed locally when it requested the
        // reset - a scanner visiting the link can't complete the
        // exchange, so the code survives for the actual click. Only
        // affects flows this client itself redirects for (password
        // reset); admin-generated invite links are a separate server-
        // side mechanism and still arrive as #access_token, which
        // app/auth/callback still handles.
        flowType: "pkce",
      },
    }
  );
}
