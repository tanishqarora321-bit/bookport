import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { unassignPartyIfNoInvoicesRemain } from "@/lib/unassign-party-if-no-invoices";

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

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function defaultAmount(weight_kg: any, unit_price: any, amount: any) {
  const explicit = numOrNull(amount);
  if (explicit !== null) return explicit;
  const weight = numOrNull(weight_kg);
  const price = numOrNull(unit_price);
  if (weight === null || price === null) return 0;
  return Math.round(weight * price * 100) / 100;
}

// This file previously contained a duplicate of the single-item POST
// handler from supplier-invoices/[id]/items/route.ts, so every inline
// edit on the ledger (invoice number, date, paid toggle) silently
// 404'd - there was no PATCH handler here at all.
//
// `items` in the body (used by the "Enter Invoice" modal's Save, which
// edits a local draft and only writes once reviewed) replaces the whole
// cost section in one call rather than diffing row by row - simplest
// consistent behavior for "this is the invoice's cost section now".
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) {
      updates[key] = value === "" ? null : value;
    }
  }

  if (Object.keys(updates).length === 0 && !Array.isArray(body.items)) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  if (Array.isArray(body.items)) {
    const { error: deleteError } = await supabase.from("supplier_invoice_items").delete().eq("supplier_invoice_id", params.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (body.items.length > 0) {
      const { error: insertError } = await supabase.from("supplier_invoice_items").insert(
        body.items.map((it: any, i: number) => ({
          supplier_invoice_id: params.id,
          description: it.description?.toString().trim() || null,
          weight_kg: numOrNull(it.weight_kg),
          unit_price: numOrNull(it.unit_price),
          amount: defaultAmount(it.weight_kg, it.unit_price, it.amount),
          sort_order: i,
        }))
      );
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: updateError } = await supabase.from("supplier_invoices").update(updates).eq("id", params.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("supplier_invoices")
    .select("*, tracking:tracking_id (eta, release_status), items:supplier_invoice_items (id, description, weight_kg, unit_price, amount, sort_order)")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}

// supplier_invoice_items has "on delete cascade" on its supplier_invoice_id
// FK, so this cleanly removes the invoice's line items along with it.
// Also clears the Supplier Name picker on this booking (only once no
// other container's invoice still needs this supplier) - same logic as
// the Forwarders equivalent.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: invoice } = await supabase.from("supplier_invoices").select("tracking_id, supplier_id").eq("id", params.id).single();

  const { error } = await supabase.from("supplier_invoices").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (invoice) {
    await unassignPartyIfNoInvoicesRemain(supabase, {
      trackingId: invoice.tracking_id,
      partyId: invoice.supplier_id,
      role: "supplier",
      invoiceTable: "supplier_invoices",
      partyColumn: "supplier_id",
    });
  }

  return NextResponse.json({ ok: true });
}
