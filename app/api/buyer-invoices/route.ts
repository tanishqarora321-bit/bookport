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
  "id, booking_number, container_number, location, month_of_loading, bl_date, due_date, forwarder_name, invoice_number, invoice_date, weight, weight_unit, total, total_usd, currency, fx_rate, paid_status, notes, tracking_id, tracking:tracking_id (eta, release_status), items:buyer_invoice_items (id, description, weight_kg, unit_price, amount, sort_order)";

// Creates a buyer invoice (sales/A-R) with its cost-section line items in
// one call, used by the "+ Add Invoice" panel. Mirrors
// app/api/supplier-invoices/route.ts exactly, minus consignee_name (the
// buyer already IS the consignee here) and plus the buyer-specific header
// fields (location/bl_date/due_date/weight/weight_unit).
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.buyer_id) return NextResponse.json({ error: "buyer_id is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("buyer_invoices")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      buyer_id: body.buyer_id,
      tracking_id: body.tracking_id || null,
      booking_number: body.booking_number || null,
      container_number: body.container_number || null,
      location: body.location || null,
      month_of_loading: body.month_of_loading || null,
      bl_date: body.bl_date || null,
      due_date: body.due_date || null,
      forwarder_name: body.forwarder_name || null,
      invoice_number: body.invoice_number || null,
      invoice_date: body.invoice_date || null,
      weight: numOrNull(body.weight),
      weight_unit: body.weight_unit || "LBS",
      currency: body.currency || "USD",
      fx_rate: numOrNull(body.fx_rate) ?? 1,
    })
    .select("id")
    .single();

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("buyer_invoice_items").insert(
      items.map((it: any, i: number) => ({
        buyer_invoice_id: invoice.id,
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
    .from("buyer_invoices")
    .select(INVOICE_SELECT)
    .eq("id", invoice.id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ invoice: full });
}
