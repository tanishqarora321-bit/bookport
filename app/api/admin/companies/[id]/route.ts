import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const STATUSES = ["trial", "active", "cancelled", "suspended"];

// Platform-owner-only. Changing a company's status to cancelled/suspended
// blocks every one of its users from signing in (getCurrentProfile()
// returns null for them) without touching/deleting any of their data -
// deliberately NOT a delete endpoint. A real "remove this company and
// its data" action is a much bigger, far more dangerous operation
// (dozens of tables, inconsistent ON DELETE behavior) and isn't built
// here on purpose - ask for it as its own deliberate task if it's ever
// actually needed.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!me.is_platform_owner) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, any> = {};

  if (body.subscription_status !== undefined) {
    if (!STATUSES.includes(body.subscription_status)) {
      return NextResponse.json({ error: `subscription_status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
    }
    updates.subscription_status = body.subscription_status;
  }
  if (body.seat_limit !== undefined) {
    const n = Number(body.seat_limit);
    if (!Number.isFinite(n) || n < 1) return NextResponse.json({ error: "seat_limit must be a positive number" }, { status: 400 });
    updates.seat_limit = Math.floor(n);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("companies").update(updates).eq("id", params.id).select().single();

  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ company: data });
}

// Platform-owner-only. A true delete - unlike PATCH above, which only
// ever blocks sign-in - and only ever allowed when the company has no
// team members. Every table that could hold real activity (bookings,
// documents, amendments, audit_log, parties, ...) is only ever written
// to by an authenticated request, which requires a profile in that
// company - so zero profiles is a real guarantee of zero data, not just
// a convention. A company anyone has actually used should be Cancelled
// instead (see PATCH), never deleted - this intentionally does not
// attempt to cascade through "dozens of tables" of real history.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!me.is_platform_owner) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const supabase = createServiceClient();

  const { data: company, error: companyError } = await supabase.from("companies").select("id, name").eq("id", params.id).single();
  if (companyError) {
    if (companyError.code === "PGRST116") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }

  const { count: profileCount, error: profileCountError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", params.id);
  if (profileCountError) return NextResponse.json({ error: profileCountError.message }, { status: 500 });
  if ((profileCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `"${company.name}" has ${profileCount} team member${profileCount === 1 ? "" : "s"} - cancel it instead of deleting, so its data stays intact.` },
      { status: 400 }
    );
  }

  // Invite emails get logged here even when they failed to send, so an
  // otherwise-empty company (a failed/never-finished onboarding attempt)
  // can still have rows - just a send log, not business data, safe to
  // clear as part of removing the company itself.
  const { error: sentEmailsError } = await supabase.from("sent_emails").delete().eq("company_id", params.id);
  if (sentEmailsError) return NextResponse.json({ error: sentEmailsError.message }, { status: 500 });

  const { error: deleteError } = await supabase.from("companies").delete().eq("id", params.id);
  if (deleteError) {
    // Some other table still references this company (a new one of the
    // "dozens" the PATCH comment mentions, not anticipated here) - surface
    // exactly which constraint blocked it rather than failing silently.
    return NextResponse.json({ error: `Could not delete: ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
