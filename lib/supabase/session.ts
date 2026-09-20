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
  const supabase = createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, full_name, role, company_id, is_active, companies(name)")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    email: user.email ?? "",
    full_name: profile.full_name,
    role: profile.role,
    company_id: profile.company_id,
    company_name: (profile as any).companies?.name ?? "—",
    is_platform_owner: profile.company_id === DEFAULT_COMPANY_ID && profile.role === "admin",
  };
}
