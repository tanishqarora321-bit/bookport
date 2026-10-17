import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import AdminCompaniesClient from "@/components/AdminCompaniesClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Platform-owner-only - see is_platform_owner's definition in
// lib/supabase/session.ts (an admin of DEFAULT_COMPANY_ID, today's
// stand-in for a real cross-company role). Every other page in the app
// is scoped to the caller's own single company; this is the one place
// that intentionally looks across all of them.
export default async function AdminPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  if (!me.is_platform_owner) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center text-center">
        <h1 className="text-lg font-semibold text-ink">Not authorized</h1>
        <p className="text-sm text-ink/50 mt-1">Platform Admin is only visible to the platform owner.</p>
      </div>
    );
  }

  const supabase = createServiceClient();

  const [{ data: companies, error: companiesError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("companies").select("id, name, seat_limit, subscription_status, created_at").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, company_id, full_name, role, is_active"),
  ]);
  if (companiesError) return <p className="text-red-600 p-6">{companiesError.message}</p>;
  if (profilesError) return <p className="text-red-600 p-6">{profilesError.message}</p>;

  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const emailById = new Map((authUsers?.users ?? []).map((u: any) => [u.id, u.email as string]));

  const rows = (companies ?? []).map((c: any) => {
    const companyProfiles = (profiles ?? []).filter((p: any) => p.company_id === c.id);
    const activeCount = companyProfiles.filter((p: any) => p.is_active).length;
    const admin = companyProfiles.find((p: any) => p.role === "admin" && p.is_active) ?? companyProfiles.find((p: any) => p.role === "admin");
    return {
      id: c.id,
      name: c.name,
      seat_limit: c.seat_limit,
      subscription_status: c.subscription_status,
      created_at: c.created_at,
      seats_used: activeCount,
      admin_email: admin ? emailById.get(admin.id) ?? "—" : "—",
    };
  });

  return <AdminCompaniesClient initialCompanies={rows} />;
}
