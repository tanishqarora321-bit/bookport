import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Platform-owner-only. Moves an EXISTING confirmed account to a different
// company as its admin - the fix for "this email already has an account
// somewhere else" (typically: someone who was the admin of a cancelled/
// suspended company and now needs to run a different one). Supabase
// refuses to invite an email that's already registered, and a real
// account can't be deleted and recreated either - bookings.owner_user_id,
// documents.uploaded_by, amendments.created_by and audit_log.user_id all
// reference profiles(id) with no ON DELETE clause (see migration 0009),
// so deleting a profile/auth user with any real history fails outright.
// Reassigning company_id in place keeps every one of those historical
// rows intact and pointing at the same profile id - only which company
// they currently belong to changes, nothing about who did what, when.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!me.is_platform_owner) return NextResponse.json({ error: "Only the platform owner can move a user between companies" }, { status: 403 });

  const body = await req.json();
  const email = (body.email ?? "").trim().toLowerCase();
  const companyId = (body.companyId ?? "").trim();
  const fullName = (body.fullName ?? "").trim();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!companyId) return NextResponse.json({ error: "Target company is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase.from("companies").select("id, name").eq("id", companyId).single();
  if (companyError) {
    if (companyError.code === "PGRST116") return NextResponse.json({ error: "Target company not found" }, { status: 404 });
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  // listUsers() isn't searchable by email server-side in this SDK version -
  // same approach already used by /admin and /api/companies/create to map
  // ids to emails, just in reverse.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
  const user = list.users.find((u: any) => u.email?.toLowerCase() === email);
  if (!user) return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 });

  const { data: profile, error: profileFetchError } = await supabase
    .from("profiles")
    .select("company_id, companies(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (profileFetchError) return NextResponse.json({ error: profileFetchError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, full_name: fullName || null, role: "admin", company_id: companyId, is_active: true },
      { onConflict: "id" }
    );
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Covers the case where this person was individually removed as a
  // teammate before (banned) - a company-wide cancel/suspend never bans
  // anyone (see /api/admin/companies/[id]), so this is a no-op for that
  // path, but harmless either way.
  await supabase.auth.admin.updateUserById(user.id, { ban_duration: "none" });

  return NextResponse.json({
    ok: true,
    email,
    previousCompanyName: (profile as any)?.companies?.name ?? null,
    newCompanyName: company.name,
  });
}
