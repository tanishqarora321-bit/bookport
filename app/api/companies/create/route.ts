import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

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

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(adminEmail, {
    data: { full_name: adminName },
    redirectTo,
  });
  if (inviteError) {
    // The company row now exists with no admin - not ideal, but better
    // than losing the company creation over an email hiccup that's
    // usually just "this address already has a pending account
    // somewhere" (see the same note in api/team/invite). The platform
    // owner can invite an admin into this company from Manage Users once
    // they're able to view another company - not built yet, so for now
    // this failure needs a manual profiles insert or a fresh email.
    return NextResponse.json(
      { error: `Company "${companyName}" was created, but inviting the admin failed: ${inviteError.message}` },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: invited.user.id, full_name: adminName || null, role: "admin", company_id: company.id },
    { onConflict: "id" }
  );
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({ ok: true, companyId: company.id, adminEmail });
}
