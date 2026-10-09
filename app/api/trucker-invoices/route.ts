import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const INVOICE_SELECT = "*, tracking:tracking_id (eta, release_status)";

// Creates a trucker invoice, used by the "+ Add Invoice" panel. This
// previously contained a duplicate of the [id] route's PATCH handler
// pasted into this file by mistake - nothing here ever actually created
// an invoice (same bug class already found/fixed on Supplier invoices).
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.trucker_id) return NextResponse.json({ error: "trucker_id is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: invoice, error } = await supabase
    .from("trucker_invoices")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      trucker_id: body.trucker_id,
      tracking_id: body.tracking_id || null,
      booking_number: body.booking_number || null,
      container_number: body.container_number || null,
      month_of_loading: body.month_of_loading || null,
      location: body.location || null,
      invoice_number: body.invoice_number || null,
      invoice_date: body.invoice_date || null,
      invoice_due_date: body.invoice_due_date || null,
      trucking: numOrNull(body.trucking) ?? 0,
      fuel_surcharge: numOrNull(body.fuel_surcharge) ?? 0,
      chassis_rental: numOrNull(body.chassis_rental) ?? 0,
      stop_off: numOrNull(body.stop_off) ?? 0,
      chassis_split: numOrNull(body.chassis_split) ?? 0,
      misc_charges: numOrNull(body.misc_charges) ?? 0,
      currency: body.currency || "USD",
      fx_rate: numOrNull(body.fx_rate) ?? 1,
    })
    .select(INVOICE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice });
}
