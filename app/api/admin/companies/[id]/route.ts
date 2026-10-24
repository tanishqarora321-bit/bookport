import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const STATUSES = ["trial", "active", "cancelled", "suspended"];

// Every table that scopes real business data to a company, per the
// current schema (supabase/migrations) - checked for zero rows before
// DELETE below is ever allowed to touch a company with team members.
// Deliberately excludes company_email_settings/document_templates
// (settings, not activity someone would mourn losing) and sent_emails
// (a send log, cleaned up unconditionally below either way).
const BUSINESS_TABLES = [
  "parties", "party_contacts", "bookings", "booking_parties", "transport_legs",
  "containers", "tracking_events", "trucking_jobs", "rate_quotes", "offers",
  "charges", "invoices", "invoice_lines", "payments", "documents", "amendments",
  "audit_log", "items", "tracking", "generated_documents", "forwarder_invoices",
  "trucker_invoices", "supplier_invoices", "offer_sheet_types", "offer_sheets",
  "rate_sheets", "forwarder_invoice_custom_columns", "trucker_invoice_custom_columns",
  "buyer_invoices", "party_payments",
];

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
// ever blocks sign-in. Allowed in two cases:
// 1. The company has no team members at all (a failed/abandoned
//    onboarding attempt, e.g. an invite that hit a conflict and was
//    never resolved) - nothing to check, nothing to lose.
// 2. The company HAS team members, but every one of BUSINESS_TABLES is
//    empty for it - accounts that exist but were never actually used.
//    Their accounts are removed too in this case (hard-deleted, email
//    freed for reuse elsewhere), which is safe specifically because
//    zero activity anywhere means nothing can reference these profiles
//    via bookings.owner_user_id / documents.uploaded_by /
//    amendments.created_by / party_payments.created_by / audit_log.user_id
//    - the only things that reference profiles(id) with no ON DELETE,
//    besides active_sessions (cleared explicitly below, since it isn't
//    company-scoped so BUSINESS_TABLES can't cover it).
// A company with any real data in ANY of those tables is always
// rejected, pointed at Cancel/Suspend (PATCH) instead - that data and
// the FK structure protecting it is real business history, never
// silently erased by this endpoint.
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

  for (const table of BUSINESS_TABLES) {
    // "*" rather than a named column - head:true never actually returns
    // row data, just the count, and a couple of these (booking_parties)
    // are join tables with a composite primary key and no "id" column.
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("company_id", params.id);
    if (error) return NextResponse.json({ error: `Could not check ${table}: ${error.message}` }, { status: 500 });
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `"${company.name}" has real data (${table.replace(/_/g, " ")}) - cancel or suspend it instead of deleting, so that history stays intact.` },
        { status: 400 }
      );
    }
  }

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id").eq("company_id", params.id);
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  for (const p of profiles ?? []) {
    const { error: sessionError } = await supabase.from("active_sessions").delete().eq("user_id", p.id);
    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    // Deletes the auth user, which cascades to delete its profiles row
    // too (profiles.id references auth.users(id) on delete cascade) -
    // safe here specifically because BUSINESS_TABLES above confirmed
    // nothing references this profile anywhere.
    const { error: delUserError } = await supabase.auth.admin.deleteUser(p.id);
    if (delUserError) return NextResponse.json({ error: `Could not remove a team member: ${delUserError.message}` }, { status: 500 });
  }

  // Settings and a send log, not business data someone would mourn
  // losing - cleared unconditionally either way.
  await supabase.from("company_email_settings").delete().eq("company_id", params.id);
  await supabase.from("document_templates").delete().eq("company_id", params.id);
  await supabase.from("sent_emails").delete().eq("company_id", params.id);

  const { error: deleteError } = await supabase.from("companies").delete().eq("id", params.id);
  if (deleteError) {
    // Some other table still references this company (one BUSINESS_TABLES
    // didn't anticipate) - surface exactly which constraint blocked it
    // rather than failing silently now that the team members are already gone.
    return NextResponse.json({ error: `Could not delete: ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, removedMembers: profiles?.length ?? 0 });
}
