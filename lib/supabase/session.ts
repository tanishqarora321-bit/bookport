import { headers } from "next/headers";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

export type CurrentProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  company_id: string;
  company_name: string;
  is_platform_owner: boolean;
};

// Central place to answer "who is asking, and which company are they in" -
// pages/routes that need to be aware of more than one company (Team/invite,
// and eventually every other module per the Stage 2 plan noted in
// lib/constants.ts) should use this instead of DEFAULT_COMPANY_ID.
//
// is_platform_owner is a stand-in, not a real column: it's true for an
// admin of DEFAULT_COMPANY_ID (the first company, which only Tanishq
// administers today). There's no dedicated cross-company "platform owner"
// role in the schema yet - if a second admin is ever added to that first
// company, they'd also be able to onboard new client companies. Revisit
// this if that's ever a real scenario, not just a today's-scale shortcut.
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  // middleware.ts already called getUser() to verify this exact request's
  // token and hands the result down via this header - reusing it here
  // skips a second, redundant round trip to Supabase's Auth server on
  // every single page/route that looks up the current profile (nearly all
  // of them). Falls back to checking directly in the one case this header
  // wouldn't be set: a request that didn't go through middleware at all.
  const hdrs = headers();
  const headerUserId = hdrs.get("x-bp-user-id");
  let userId: string;
  let userEmail: string;

  if (headerUserId) {
    userId = headerUserId;
    userEmail = hdrs.get("x-bp-user-email") ?? "";
  } else {
    const supabase = createServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;
    userId = userData.user.id;
    userEmail = userData.user.email ?? "";
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, full_name, role, company_id, is_active, companies(name, subscription_status)")
    .eq("id", userId)
    .single();

  if (!profile || !profile.is_active) return null;

  const isPlatformOwner = profile.company_id === DEFAULT_COMPANY_ID && profile.role === "admin";

  // A cancelled/suspended company's users are blocked from signing in at
  // all (same "null = not signed in" path every page/route already
  // handles) - manually set from /admin by the platform owner, who is
  // exempt so a status mistake can never lock them out of fixing it.
  const subscriptionStatus = (profile as any).companies?.subscription_status ?? "active";
  if (!isPlatformOwner && (subscriptionStatus === "cancelled" || subscriptionStatus === "suspended")) {
    return null;
  }

  return {
    id: profile.id,
    email: userEmail,
    full_name: profile.full_name,
    role: profile.role,
    company_id: profile.company_id,
    company_name: (profile as any).companies?.name ?? "—",
    is_platform_owner: isPlatformOwner,
  };
}
