import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

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

const INVOICE_SELECT =
  "id, booking_number, container_number, month_of_loading, forwarder_name, consignee_name, invoice_number, invoice_date, total, total_usd, currency, fx_rate, paid_status, notes, tracking_id, tracking:tracking_id (eta, release_status), items:supplier_invoice_items (id, description, weight_kg, unit_price, amount, sort_order)";

// Creates a supplier invoice with its cost-section line items in one
// call, used by the "+ Add Invoice" panel. This was previously a
// duplicate of the single-item POST handler from
// supplier-invoices/[id]/items/route.ts pasted into this file by
// mistake - nothing here ever actually created an invoice, which is
// why the ledger showed "No invoices yet" with no error.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.supplier_id) return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("supplier_invoices")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      supplier_id: body.supplier_id,
      tracking_id: body.tracking_id || null,
      booking_number: body.booking_number || null,
      container_number: body.container_number || null,
      month_of_loading: body.month_of_loading || null,
      forwarder_name: body.forwarder_name || null,
      consignee_name: body.consignee_name || null,
      invoice_number: body.invoice_number || null,
      invoice_date: body.invoice_date || null,
      currency: body.currency || "EUR",
      fx_rate: numOrNull(body.fx_rate) ?? 1,
    })
    .select("id")
    .single();

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("supplier_invoice_items").insert(
      items.map((it: any, i: number) => ({
        supplier_invoice_id: invoice.id,
        description: it.description?.toString().trim() || null,
        weight_kg: numOrNull(it.weight_kg),
        unit_price: numOrNull(it.unit_price),
        amount: defaultAmount(it.weight_kg, it.unit_price, it.amount),
        sort_order: i,
      }))
    );
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const { data: full, error: fetchError } = await supabase
    .from("supplier_invoices")
    .select(INVOICE_SELECT)
    .eq("id", invoice.id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ invoice: full });
}
