import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import TeamClient from "@/components/TeamClient";
import ChangePasswordCard from "@/components/ChangePasswordCard";
import LetterheadSettingsCard from "@/components/LetterheadSettingsCard";
import EmailSettingsCard from "@/components/EmailSettingsCard";
import SignInRequired from "@/components/SignInRequired";
import SettingsSubnav from "@/components/SettingsSubnav";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function TeamPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired message="Manage Users needs to know which company you belong to." />;

  const supabase = createServiceClient();

  // All at once (speed, owner 2026-11) - these used to run one after
  // another.
  const [
    { data: company, error: companyError },
    { data: profiles, error: profilesError },
    // One letterhead config backs both document types (Final Invoice and
    // Booking Instructions) - any one row's template_config represents it,
    // since app/api/document-templates PATCH keeps them in sync.
    { data: templateRow },
    { data: emailSettingsRow },
  ] = await Promise.all([
    supabase.from("companies").select("name, seat_limit").eq("id", me.company_id).single(),
    supabase.from("profiles").select("id, full_name, role, is_active, created_at").eq("company_id", me.company_id).order("created_at"),
    supabase.from("document_templates").select("template_config").eq("company_id", me.company_id).limit(1).maybeSingle(),
    supabase.from("company_email_settings").select("website").eq("company_id", me.company_id).maybeSingle(),
  ]);
  if (companyError) return <p className="text-red-600 p-6">{companyError.message}</p>;
  if (profilesError) return <p className="text-red-600 p-6">{profilesError.message}</p>;

  // Emails / invite status for THIS company's users only (was a listing of
  // every user on the platform), looked up in parallel.
  const authUsers = await Promise.all(
    (profiles ?? []).map((p: { id: string }) => supabase.auth.admin.getUserById(p.id).then((r: any) => r.data.user).catch(() => null))
  );
  const emailById = new Map(authUsers.filter(Boolean).map((u: any) => [u.id, u.email as string]));
  const confirmedById = new Map(authUsers.filter(Boolean).map((u: any) => [u.id, !!u.email_confirmed_at]));

  const teammates = (profiles ?? []).map((p: { id: string; full_name: string | null; role: string; is_active: boolean; created_at: string }) => ({
    ...p,
    email: emailById.get(p.id) ?? "—",
    pending: !confirmedById.get(p.id),
  }));

  return (
    <div>
      <div className="hdg">
        <h1 className="h1">Settings &amp; Control</h1>
        <p className="sub">Manage your account, documents, email and team access.</p>
      </div>
      <div className="settings-grid">
        <SettingsSubnav />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <ChangePasswordCard email={me.email} />
          <LetterheadSettingsCard config={templateRow?.template_config ?? null} isAdmin={me.role === "admin"} />
          <EmailSettingsCard config={emailSettingsRow ?? null} isAdmin={me.role === "admin"} />
          <TeamClient
            initialTeammates={teammates}
            seatLimit={company.seat_limit}
            companyName={company.name}
            isAdmin={me.role === "admin"}
          />
        </div>
      </div>
    </div>
  );
}
