import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { generateCompanyOnboardingEmail } from "@/lib/email/generateInviteEmail";
import { sendEmail } from "@/lib/send-email";

// Platform-owner-only - sets/replaces who a company's admin is, for when
// the contact changes or the first email was typo'd/wrong.
//
// - If the current admin hasn't accepted their invite yet, this corrects
//   THEIR email in place (same account, fresh link) - nothing to lose,
//   they never signed in.
// - Otherwise (no admin yet, or the current one already has a real
//   account) this invites the given email as a NEW admin profile rather
//   than touching the existing one - an active admin's own account isn't
//   silently repointed to a different email out from under them. If that
//   email already has an account elsewhere, this returns the same
//   EMAIL_ALREADY_REGISTERED conflict /api/companies/create does, so the
//   client can offer the same "move their account here" resolution.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!me.is_platform_owner) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json();
  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.fullName ?? "").trim();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase.from("companies").select("id, name").eq("id", params.id).single();
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
  const currentAdmin = profiles.find((p: { is_active: boolean }) => p.is_active) ?? profiles[0] ?? null;

  let currentAdminUser: any = null;
  if (currentAdmin) {
    const { data } = await supabase.auth.admin.getUserById(currentAdmin.id);
    currentAdminUser = data?.user ?? null;
  }

  const redirectTo = `${req.nextUrl.origin}/auth/callback`;

  // Current admin exists and is still pending - correct their email and
  // resend, same account.
  if (currentAdminUser && !currentAdminUser.email_confirmed_at) {
    if (currentAdminUser.email?.toLowerCase() === email) {
      return NextResponse.json({ error: "That's already this company's pending admin email." }, { status: 400 });
    }
    const { error: updateEmailError } = await supabase.auth.admin.updateUserById(currentAdmin.id, { email });
    if (updateEmailError) return NextResponse.json({ error: updateEmailError.message }, { status: 500 });
    if (fullName) await supabase.from("profiles").update({ full_name: fullName }).eq("id", currentAdmin.id);

    const { data: linkData, error: inviteError } = await supabase.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 });

    const { subject, html } = generateCompanyOnboardingEmail({ companyName: company.name, actionLink: linkData.properties.action_link });
    const sendResult = await sendEmail(supabase, { companyId: company.id, to: [email], subject, html, emailType: "company_onboarding", fromNameOverride: "Ship-Sphere" });
    if (!sendResult.ok) return NextResponse.json({ error: `Email updated, but the invite failed to send: ${sendResult.error}` }, { status: 500 });

    return NextResponse.json({ ok: true, email, mode: "updated" });
  }

  // No admin yet, or the current one already has a real account - invite
  // this email as a new admin rather than repointing an active account.
  const { data: linkData, error: inviteError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName }, redirectTo },
  });
  if (inviteError) {
    const alreadyRegistered = inviteError.status === 422 || /already been registered/i.test(inviteError.message);
    if (alreadyRegistered) {
      const { data: list } = await supabase.auth.admin.listUsers();
      const existingUser = list?.users.find((u: any) => u.email?.toLowerCase() === email);
      let existingCompanyName: string | null = null;
      if (existingUser) {
        const { data: existingProfile } = await supabase.from("profiles").select("companies(name)").eq("id", existingUser.id).maybeSingle();
        existingCompanyName = (existingProfile as any)?.companies?.name ?? null;
      }
      return NextResponse.json(
        {
          error: `${email} already has an account on Ship-Sphere${existingCompanyName ? ` (currently under ${existingCompanyName})` : ""}.`,
          code: "EMAIL_ALREADY_REGISTERED",
          companyId: company.id,
          companyName: company.name,
          existingCompanyName,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: linkData.user.id, full_name: fullName || null, role: "admin", company_id: company.id, is_active: true },
    { onConflict: "id" }
  );
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { subject, html } = generateCompanyOnboardingEmail({ companyName: company.name, actionLink: linkData.properties.action_link });
  const sendResult = await sendEmail(supabase, { companyId: company.id, to: [email], subject, html, emailType: "company_onboarding", fromNameOverride: "Ship-Sphere" });
  if (!sendResult.ok) return NextResponse.json({ error: `Admin added, but the invite failed to send: ${sendResult.error}` }, { status: 500 });

  return NextResponse.json({ ok: true, email, mode: "invited" });
}
