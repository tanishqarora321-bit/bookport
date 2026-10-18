import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { generateTeamInviteEmail } from "@/lib/email/generateInviteEmail";
import { sendEmail } from "@/lib/send-email";

const ROLES = ["admin", "operations", "finance", "readonly"];

// Creates a teammate login under the CALLER's OWN company, blocked once
// that company's seat_limit is reached. Only an admin of that company can
// invite - the endpoint has no way to invite into a company other than
// the caller's own, by construction, so there's no need for a separate
// "which company" input to trust or validate. Uses generateLink({type:
// 'invite'}) + our own Resend send rather than inviteUserByEmail -
// Supabase's own built-in email sending is rate-limited/unreliable on
// the free tier (confirmed: a real invite never arrived) and we already
// have working email infrastructure. Still never puts a password in a
// request body/log/chat - the invitee sets their own via the link.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can invite teammates" }, { status: 403 });

  const body = await req.json();
  const email = (body.email ?? "").trim().toLowerCase();
  const full_name = (body.full_name ?? "").trim();
  const role = ROLES.includes(body.role) ? body.role : "operations";

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("name, seat_limit")
    .eq("id", me.company_id)
    .single();
  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });

  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", me.company_id)
    .eq("is_active", true);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if ((count ?? 0) >= company.seat_limit) {
    return NextResponse.json(
      { error: `Seat limit reached (${count}/${company.seat_limit}). Remove a teammate or upgrade the plan before inviting another.` },
      { status: 400 }
    );
  }

  // Without an explicit redirectTo, Supabase sends the invite link back to
  // whatever "Site URL" is set in the dashboard's Auth settings - which
  // defaults to http://localhost:3000 and 404s for anyone who isn't
  // literally running the app on their own machine. req.nextUrl.origin is
  // whichever origin this request actually came from (the deployed URL in
  // production, localhost in local dev), so this is correct either way -
  // PROVIDED that origin is also added to the Redirect URLs allow-list in
  // Supabase's dashboard, which Supabase enforces regardless of what's
  // passed here.
  const redirectTo = `${req.nextUrl.origin}/auth/callback`;

  const { data: linkData, error: inviteError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name }, redirectTo },
  });

  if (inviteError) {
    // If this email already has a pending (unconfirmed) account from an
    // earlier attempt, the reliable fix is deleting it first: Supabase
    // Dashboard -> Authentication -> Users -> delete that row -> invite
    // again.
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: linkData.user.id, full_name: full_name || null, role, company_id: me.company_id },
    { onConflict: "id" }
  );
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { subject, html } = generateTeamInviteEmail({ companyName: company.name, actionLink: linkData.properties.action_link });
  const sendResult = await sendEmail(supabase, {
    companyId: me.company_id,
    to: [email],
    subject,
    html,
    emailType: "team_invite",
    // The inviting admin's own identity, not a shared company-wide field -
    // multiple admins at the same company each invite under their own name
    // (see Send Instructions' sign-off for the same reasoning).
    fromNameOverride: me.full_name || me.email,
    replyTo: me.email,
  });
  if (!sendResult.ok) {
    return NextResponse.json(
      { error: `Account created, but the invite email failed to send: ${sendResult.error}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, email, role });
}
