import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Deliberately excludes: id, company_id, forwarder_id, tracking_id, total
// (total is a Postgres GENERATED column -- trying to write it directly
// would error, and there's no reason to: it recomputes automatically
// whenever any of the charge columns below change).
const EDITABLE_COLUMNS = [
  "booking_number",
  "container_number",
  "month_of_loading",
  "shipping_line",
  "consignee_name",
  "pol",
  "pod",
  "invoice_number",
  "invoice_date",
  "invoice_due_date",
  "freight_charges",
  "bl_fees",
  "aes_fees",
  "extra_charges",
  "correction_charges",
  "demurrage",
  "currency",
  "fx_rate",
  "paid_status",
];

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
  // overwrite - the client only ever sends the one key it's editing,
  // and PostgREST has no partial-jsonb-update operator to do this in
  // one round trip, so read-merge-write here instead.
  if (body.custom_charges && typeof body.custom_charges === "object") {
    const { data: existing } = await supabase.from("forwarder_invoices").select("custom_charges").eq("id", params.id).single();
    updates.custom_charges = { ...(existing?.custom_charges ?? {}), ...body.custom_charges };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("forwarder_invoices")
    .update(updates)
    .eq("id", params.id)
    .select("*, tracking:tracking_id (eta, release_status)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

// Nothing else references forwarder_invoices.id, so this is a plain
// delete - no cascade/detach concerns like a booking or party delete
// has. Mainly for a legacy row from before invoices were auto-created
// (no tracking_id, so it can never get a live ETA/status) or a wrong
// pending shell someone wants gone rather than filled in.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("forwarder_invoices").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
