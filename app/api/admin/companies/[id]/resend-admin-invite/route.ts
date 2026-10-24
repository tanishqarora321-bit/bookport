import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { generateCompanyOnboardingEmail } from "@/lib/email/generateInviteEmail";
import { sendEmail } from "@/lib/send-email";

// Platform-owner-only - resends the onboarding invite to a client
// company's admin when the first email's link expired/was lost (e.g. the
// window got closed before they clicked it). Same generateLink-is-safe-
// to-repeat-while-unconfirmed behavior as /api/team/[id]/resend.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!me.is_platform_owner) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", params.id)
    .single();
  if (companyError) {
    if (companyError.code === "PGRST116") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("company_id", params.id)
    .eq("role", "admin");
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });
  const admin = profiles.find((p: { is_active: boolean }) => p.is_active) ?? profiles[0];
  if (!admin) return NextResponse.json({ error: "This company has no admin to resend an invite to." }, { status: 404 });

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(admin.id);
  if (userError || !userData.user) return NextResponse.json({ error: userError?.message || "Admin user not found" }, { status: 404 });
  if (userData.user.email_confirmed_at) {
    return NextResponse.json({ error: "This company's admin has already accepted their invite - there's nothing to resend." }, { status: 400 });
  }
  const email = userData.user.email!;

  const redirectTo = `${req.nextUrl.origin}/auth/callback`;
  const { data: linkData, error: inviteError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 });

  const { subject, html } = generateCompanyOnboardingEmail({ companyName: company.name, actionLink: linkData.properties.action_link });
  const sendResult = await sendEmail(supabase, {
    companyId: company.id,
    to: [email],
    subject,
    html,
    emailType: "company_onboarding",
    fromNameOverride: "Ship-Sphere",
  });
  if (!sendResult.ok) return NextResponse.json({ error: `Failed to send the invite email: ${sendResult.error}` }, { status: 500 });

  return NextResponse.json({ ok: true, email });
}
