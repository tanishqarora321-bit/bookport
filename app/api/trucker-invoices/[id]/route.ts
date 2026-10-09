import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { unassignPartyIfNoInvoicesRemain } from "@/lib/unassign-party-if-no-invoices";

// Deliberately excludes: id, company_id, trucker_id, tracking_id, total,
// total_usd (both totals are Postgres GENERATED columns off the charge
// columns below - trying to write them directly would error, and
// there's no reason to since they recompute automatically).
const EDITABLE_COLUMNS = [
  "booking_number",
  "container_number",
  "month_of_loading",
  "location",
  "invoice_number",
  "invoice_date",
  "invoice_due_date",
  "trucking",
  "fuel_surcharge",
  "chassis_rental",
  "stop_off",
  "chassis_split",
  "misc_charges",
  "currency",
  "fx_rate",
  "paid_status",
];

// This file previously contained a duplicate of the top-level POST
// handler, so every inline edit on the ledger silently 404'd - there
// was no PATCH handler here at all (same bug class already found/fixed
// on Supplier invoices).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) {
      updates[key] = value === "" ? null : value;
    }
  }

  // custom_charges is a merge (set one column's value), not a full
  // overwrite - same reasoning as forwarder_invoices' PATCH route.
  if (body.custom_charges && typeof body.custom_charges === "object") {
    const { data: existing } = await supabase.from("trucker_invoices").select("custom_charges").eq("id", params.id).single();
    updates.custom_charges = { ...(existing?.custom_charges ?? {}), ...body.custom_charges };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("trucker_invoices")
    .update(updates)
    .eq("id", params.id)
    .select("*, tracking:tracking_id (eta, release_status)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

// Nothing else references trucker_invoices.id, so this is a plain
// delete. Also clears the Trucker Name picker on this booking (only
// once no other container's invoice still needs this trucker) - same
// logic as the Forwarders/Suppliers equivalents.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: invoice } = await supabase.from("trucker_invoices").select("tracking_id, trucker_id").eq("id", params.id).single();

  const { error } = await supabase.from("trucker_invoices").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (invoice) {
    await unassignPartyIfNoInvoicesRemain(supabase, {
      trackingId: invoice.tracking_id,
      partyId: invoice.trucker_id,
      role: "trucker",
      invoiceTable: "trucker_invoices",
      partyColumn: "trucker_id",
    });
  }

  return NextResponse.json({ ok: true });
}
