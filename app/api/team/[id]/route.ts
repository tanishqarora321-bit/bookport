import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Both handlers below require the caller to be an admin AND require the
// target profile to belong to the CALLER's OWN company - without that
// second check, any company's admin could remove or restore a teammate
// in a totally different company just by knowing/guessing their profile
// id, since profile ids aren't secret. This matters now that there's
// more than one company (see /api/companies/create).

// Soft-deactivate only - see the note in migration 0009 for why a real
// delete of the profile or the auth user isn't safe once someone has
// any activity history (bookings/documents/amendments/audit_log all
// reference profiles(id) with no ON DELETE clause). Banning the auth
// account (rather than just flipping is_active) also stops them
// signing in at all, not just being filtered out of the company's UI.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can remove teammates" }, { status: 403 });

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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", params.id);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { error: banError } = await supabase.auth.admin.updateUserById(params.id, {
    ban_duration: "876600h", // ~100 years - Supabase's admin API has no permanent-ban value, this is the documented way to approximate one
  });
  if (banError) return NextResponse.json({ error: banError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Restore a previously-removed teammate, blocked once seats are full.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Only an admin can restore teammates" }, { status: 403 });

  const supabase = createServiceClient();

  const { data: profile, error: profileFetchError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", params.id)
    .single();
  if (profileFetchError) return NextResponse.json({ error: profileFetchError.message }, { status: 500 });
  if (profile.company_id !== me.company_id) {
    return NextResponse.json({ error: "That teammate isn't in your company" }, { status: 403 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("seat_limit")
    .eq("id", profile.company_id)
    .single();
  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });

  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", profile.company_id)
    .eq("is_active", true);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if ((count ?? 0) >= company.seat_limit) {
    return NextResponse.json(
      { error: `Seat limit reached (${count}/${company.seat_limit}). Remove another teammate or upgrade the plan first.` },
      { status: 400 }
    );
  }

  const { error: profileError } = await supabase.from("profiles").update({ is_active: true }).eq("id", params.id);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { error: unbanError } = await supabase.auth.admin.updateUserById(params.id, { ban_duration: "none" });
  if (unbanError) return NextResponse.json({ error: unbanError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
