import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

// Per spec: match on booking_number first, container_number as fallback.
// Returns everything needed to auto-fill a forwarder invoice EXCEPT eta/
// release_status -- those are deliberately left out here too, because the
// invoice UI reads them live via tracking_id at render time, never copies
// them into form state that could go stale.
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ error: "query param is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Try booking_number first (preferred match key).
  let { data: tracking } = await supabase
    .from("tracking")
    .select("id, booking_id, party_id, booking_number, container_number, shipping_line")
    .eq("company_id", DEFAULT_COMPANY_ID)
    .eq("booking_number", query)
    .maybeSingle();

  let matchedBy = "booking_number";

  // Fall back to container_number if no booking-number match.
  if (!tracking) {
    const { data: byContainer } = await supabase
      .from("tracking")
      .select("id, booking_id, party_id, booking_number, container_number, shipping_line")
      .eq("company_id", DEFAULT_COMPANY_ID)
      .eq("container_number", query)
      .maybeSingle();
    tracking = byContainer;
    matchedBy = "container_number";
  }

  if (!tracking) {
    return NextResponse.json({ matched: false });
  }

  const [{ data: booking }, { data: party }] = await Promise.all([
    tracking.booking_id
      ? supabase.from("bookings").select("etd, pol, pod").eq("id", tracking.booking_id).single()
      : Promise.resolve({ data: null }),
    tracking.party_id
      ? supabase.from("parties").select("id, legal_name").eq("id", tracking.party_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    matched: true,
    matched_by: matchedBy,
    tracking_id: tracking.id,
    booking_number: tracking.booking_number,
    container_number: tracking.container_number,
    shipping_line: tracking.shipping_line,
    month_of_loading: booking?.etd ? booking.etd.slice(0, 10) : null, // date of loading = ETD, per spec
    pol: booking?.pol ?? null,
    pod: booking?.pod ?? null,
    consignee_party_id: party?.id ?? null,
    consignee_name: party?.legal_name ?? null,
  });
}
