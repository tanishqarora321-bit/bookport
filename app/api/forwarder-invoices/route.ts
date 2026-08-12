import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.forwarder_id) {
    return NextResponse.json({ error: "forwarder_id is required" }, { status: 400 });
  }

  const numeric = (v: any) => (v === "" || v === null || v === undefined ? 0 : Number(v));

  const { data, error } = await supabase
    .from("forwarder_invoices")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      forwarder_id: body.forwarder_id,
      tracking_id: body.tracking_id || null,
      booking_number: body.booking_number || null,
      container_number: body.container_number || null,
      month_of_loading: body.month_of_loading || null,
      shipping_line: body.shipping_line || null,
      consignee_party_id: body.consignee_party_id || null,
      consignee_name: body.consignee_name || null,
      pol: body.pol || null,
      pod: body.pod || null,
      invoice_number: body.invoice_number || null,
      invoice_date: body.invoice_date || null,
      invoice_due_date: body.invoice_due_date || null,
      freight_charges: numeric(body.freight_charges),
      bl_fees: numeric(body.bl_fees),
      aes_fees: numeric(body.aes_fees),
      extra_charges: numeric(body.extra_charges),
      correction_charges: numeric(body.correction_charges),
      demurrage: numeric(body.demurrage),
      currency: body.currency || "USD",
    })
    .select("*, tracking:tracking_id (eta, release_status)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
