import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Deliberately excludes: id, company_id, supplier_id, tracking_id, total,
// total_usd (both totals are Postgres-maintained - total via the live
// recalc_supplier_invoice_total() trigger on supplier_invoice_items,
// total_usd as a generated column off total*fx_rate).
const EDITABLE_COLUMNS = [
  "booking_number",
  "container_number",
  "month_of_loading",
  "forwarder_name",
  "consignee_name",
  "invoice_number",
  "invoice_date",
  "currency",
  "fx_rate",
  "paid_status",
  "notes",
];

// This file previously contained a duplicate of the single-item POST
// handler from supplier-invoices/[id]/items/route.ts, so every inline
// edit on the ledger (invoice number, date, paid toggle) silently
// 404'd - there was no PATCH handler here at all.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) {
      updates[key] = value === "" ? null : value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("supplier_invoices")
    .update(updates)
    .eq("id", params.id)
    .select("*, tracking:tracking_id (eta, release_status)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

// supplier_invoice_items has "on delete cascade" on its supplier_invoice_id
// FK, so this cleanly removes the invoice's line items along with it.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("supplier_invoices").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
