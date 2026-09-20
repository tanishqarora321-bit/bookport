import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import TeamClient from "@/components/TeamClient";
import ChangePasswordCard from "@/components/ChangePasswordCard";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Unlike every other module (still on DEFAULT_COMPANY_ID/service-role
// until the rest of Stage 2 happens - see lib/constants.ts), this page
// requires a real signed-in session: managing who can log in only makes
// sense per-company, and there's more than one company as of the first
// client onboarding built here.
export default async function TeamPage() {
  const me = await getCurrentProfile();
  if (!me) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center text-center">
        <h1 className="text-lg font-semibold text-ink">Sign in required</h1>
        <p className="text-sm text-ink/50 mt-1">Manage Users needs to know which company you belong to.</p>
        <a href="/login" className="mt-4 text-sm bg-accent text-white px-4 py-2 rounded-lg">
          Go to sign in
        </a>
      </div>
    );
  }

  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("name, seat_limit")
    .eq("id", me.company_id)
    .single();
  if (companyError) return <p className="text-red-600 p-6">{companyError.message}</p>;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .eq("company_id", me.company_id)
    .order("created_at");
  if (profilesError) return <p className="text-red-600 p-6">{profilesError.message}</p>;

  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const emailById = new Map((authUsers?.users ?? []).map((u: any) => [u.id, u.email as string]));

  const teammates = (profiles ?? []).map((p: { id: string; full_name: string | null; role: string; is_active: boolean; created_at: string }) => ({
    ...p,
    email: emailById.get(p.id) ?? "—",
  }));

  return (
    <div>
      <ChangePasswordCard email={me.email} />
      <TeamClient
        initialTeammates={teammates}
        seatLimit={company.seat_limit}
        companyName={company.name}
        isAdmin={me.role === "admin"}
        isPlatformOwner={me.is_platform_owner}
      />
    </div>
  );
}
