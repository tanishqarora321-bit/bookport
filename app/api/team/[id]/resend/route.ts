import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { generateTeamInviteEmail } from "@/lib/email/generateInviteEmail";
import { sendEmail } from "@/lib/send-email";

// Resends a still-pending teammate invite - confirmed live against this
// project that generateLink({type:"invite"}) is safe to call again for an
// email that hasn't confirmed yet (same user id, fresh link/token); it
// only errors ("already been registered") once the person has actually
// set a password, which this endpoint treats as "nothing to resend."
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can resend invites" }, { status: 403 });

  const supabase = createServiceClient();

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", params.id)
    .single();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (target.company_id !== me.company_id) {
    return NextResponse.json({ error: "That teammate isn't in your company" }, { status: 403 });
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(params.id);
  if (userError || !userData.user) return NextResponse.json({ error: userError?.message || "User not found" }, { status: 404 });
  if (userData.user.email_confirmed_at) {
    return NextResponse.json({ error: "This teammate has already accepted their invite - there's nothing to resend." }, { status: 400 });
  }
  const email = userData.user.email!;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("name")
    .eq("id", me.company_id)
    .single();
  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });

  const redirectTo = `${req.nextUrl.origin}/auth/callback`;
  const { data: linkData, error: inviteError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 });

  const { subject, html } = generateTeamInviteEmail({ companyName: company.name, actionLink: linkData.properties.action_link });
  const sendResult = await sendEmail(supabase, {
    companyId: me.company_id,
    to: [email],
    subject,
    html,
    emailType: "team_invite",
    fromNameOverride: me.full_name || me.email,
    replyTo: me.email,
  });
  if (!sendResult.ok) return NextResponse.json({ error: `Failed to send the invite email: ${sendResult.error}` }, { status: 500 });

  return NextResponse.json({ ok: true, email });
}
