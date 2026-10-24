import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { generateCompanyOnboardingEmail } from "@/lib/email/generateInviteEmail";
import { sendEmail } from "@/lib/send-email";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";
}

// Onboards a brand-new client company and invites its first admin, in one
// step - only usable by the platform owner (see the is_platform_owner
// note in lib/supabase/session.ts for what that means today), since this
// is the one action that reaches outside the caller's own company.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!me.is_platform_owner) {
    return NextResponse.json({ error: "Only the platform owner can onboard a new company" }, { status: 403 });
  }

  const body = await req.json();
  const companyName = (body.companyName ?? "").trim();
  const adminEmail = (body.adminEmail ?? "").trim().toLowerCase();
  const adminName = (body.adminName ?? "").trim();
  const seatLimitRaw = Number(body.seatLimit);
  const seatLimit = Number.isFinite(seatLimitRaw) && seatLimitRaw > 0 ? Math.floor(seatLimitRaw) : 5;

  if (!companyName) return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  if (!adminEmail) return NextResponse.json({ error: "Admin email is required" }, { status: 400 });

  const supabase = createServiceClient();

  const baseSlug = slugify(companyName);
  let company: { id: string } | null = null;
  for (const slug of [baseSlug, `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`]) {
    const { data, error } = await supabase
      .from("companies")
      .insert({ name: companyName, slug, seat_limit: seatLimit })
      .select("id")
      .single();
    if (!error) {
      company = data;
      break;
    }
    // Only retry with a suffixed slug on a uniqueness conflict - any other
    // error should surface immediately instead of silently trying again.
    if (error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!company) return NextResponse.json({ error: "Could not create a unique company slug - try a different name" }, { status: 500 });

  const redirectTo = `${req.nextUrl.origin}/auth/callback`;

  // generateLink + our own Resend send, not inviteUserByEmail - Supabase's
  // built-in email sending is rate-limited/unreliable on the free tier
  // (confirmed live: a real onboarding invite never arrived).
  const { data: linkData, error: inviteError } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: adminEmail,
    options: { data: { full_name: adminName }, redirectTo },
  });
  if (inviteError) {
    // The company row now exists with no admin yet either way - not
    // ideal, but better than losing the company creation over an email
    // hiccup. The common case is this exact email already having a real,
    // confirmed account under a different (often cancelled/suspended)
    // company - Supabase refuses to invite an already-registered email,
    // and that account can't just be deleted and recreated (see the note
    // in /api/admin/reassign-user). Surface that distinctly so the client
    // can offer moving the existing account here instead of just showing
    // a dead-end error.
    const alreadyRegistered = inviteError.status === 422 || /already been registered/i.test(inviteError.message);
    if (alreadyRegistered) {
      const { data: list } = await supabase.auth.admin.listUsers();
      const existingUser = list?.users.find((u: any) => u.email?.toLowerCase() === adminEmail);
      let existingCompanyName: string | null = null;
      if (existingUser) {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("companies(name)")
          .eq("id", existingUser.id)
          .maybeSingle();
        existingCompanyName = (existingProfile as any)?.companies?.name ?? null;
      }
      return NextResponse.json(
        {
          error: `${adminEmail} already has an account on Ship-Sphere${existingCompanyName ? ` (currently under ${existingCompanyName})` : ""}.`,
          code: "EMAIL_ALREADY_REGISTERED",
          companyId: company.id,
          companyName,
          existingCompanyName,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: `Company "${companyName}" was created, but inviting the admin failed: ${inviteError.message}` },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: linkData.user.id, full_name: adminName || null, role: "admin", company_id: company.id },
    { onConflict: "id" }
  );
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  // Sent as "Ship-Sphere" itself (fromNameOverride), not under the brand-
  // new company's own name - it has no letterhead/identity set up yet,
  // and this is the platform inviting someone, not that company emailing
  // its own team.
  const { subject, html } = generateCompanyOnboardingEmail({ companyName, actionLink: linkData.properties.action_link });
  const sendResult = await sendEmail(supabase, {
    companyId: company.id,
    to: [adminEmail],
    subject,
    html,
    emailType: "company_onboarding",
    fromNameOverride: "Ship-Sphere",
  });
  if (!sendResult.ok) {
    return NextResponse.json(
      { error: `Company "${companyName}" was created, but the invite email failed to send: ${sendResult.error}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, companyId: company.id, adminEmail });
}
