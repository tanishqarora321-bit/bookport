import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.booking_id || !body.party_id) {
    return NextResponse.json({ error: "booking_id and party_id are required" }, { status: 400 });
  }

  // Pull the fields that come "from the Booking & Instructions module" per
  // the spec: booking number, forwarder, shipping line.
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("carrier_booking_no, forwarder_name, carrier")
    .eq("id", body.booking_id)
    .single();

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("tracking")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      booking_id: body.booking_id,
      party_id: body.party_id,
      item_id: body.item_id || null,
      booking_number: booking.carrier_booking_no,
      forwarder_name: booking.forwarder_name,
      shipping_line: booking.carrier,
      bl_status: "N",
      invoice_sent: false,
      documents_sent: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tracking: data });
}
