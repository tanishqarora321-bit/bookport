import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import TeamClient from "@/components/TeamClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, DEFAULT_COMPANY_ID - same pattern as
// every other module until real session-based company_id lands (see
// lib/constants.ts). This page itself is stage-1 login groundwork: it
// manages who CAN sign in, but nothing yet blocks a signed-out visitor
// from reaching the app - see middleware.ts for why that's deliberate.
export default async function TeamPage() {
  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("seat_limit")
    .eq("id", DEFAULT_COMPANY_ID)
    .single();
  if (companyError) return <p className="text-red-600 p-6">{companyError.message}</p>;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .order("created_at");
  if (profilesError) return <p className="text-red-600 p-6">{profilesError.message}</p>;

  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const emailById = new Map((authUsers?.users ?? []).map((u: any) => [u.id, u.email as string]));

  const teammates = (profiles ?? []).map((p: { id: string; full_name: string | null; role: string; is_active: boolean; created_at: string }) => ({
    ...p,
    email: emailById.get(p.id) ?? "—",
  }));

  return <TeamClient initialTeammates={teammates} seatLimit={company.seat_limit} />;
}
