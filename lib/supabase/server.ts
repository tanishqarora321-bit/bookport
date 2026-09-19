import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// set/remove are no-ops when called from a Server Component (Next.js only
// allows cookie writes from a Server Action or Route Handler) - wrapped in
// try/catch per the @supabase/ssr docs so that doesn't throw; middleware.ts
// is what actually persists a refreshed session cookie on every request.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options);
          } catch {}
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, "", options);
          } catch {}
        }
      }
    }
  );
}

// Service-role client for the extraction API route only — it needs to write
// documents/bookings on the uploader's behalf before RLS-scoped edits take over.
export function createServiceClient() {
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
