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
    { auth: { detectSessionInUrl: false } }
  );
}
