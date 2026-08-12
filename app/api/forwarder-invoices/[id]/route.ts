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
