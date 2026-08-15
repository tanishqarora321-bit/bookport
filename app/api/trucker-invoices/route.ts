import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.trucker_id) {
    return NextResponse.json({ error: "trucker_id is required" }, { status: 400 });
  }

  const numeric = (v: any) => (v === "" || v === null || v === undefined ? 0 : Number(v));

  const { data, error } = await supabase
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
      amount: numeric(body.amount),
      currency: body.currency || "USD",
      charges_note: body.charges_note || null,
    })
    .select("*, tracking:tracking_id (eta, release_status)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
