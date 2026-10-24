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
