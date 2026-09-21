import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Every column EditableCell.tsx is allowed to PATCH from the Booking &
// Instructions grid (components/BookingsClient.tsx) - kept as an
// allow-list, same pattern as containers/[containerId]/route.ts, so a
// stray/unexpected key in the request body is silently ignored rather
// than letting a client write to an arbitrary bookings column.
const EDITABLE_COLUMNS = [
  "carrier_booking_no",
  "erd",
  "si_cutoff",
  "cargo_cutoff",
  "pol",
  "pod",
  "final_destination",
  "bl_issued_at",
  "carrier",
  "vessel",
  "status",
  // These 6 back the "Shipment & Routing Details" section on the
  // single-booking detail page (app/bookings/[id]/page.tsx) - they were
  // never added here, so every one of those fields silently failed to
  // save ("No editable fields in request") no matter what was typed.
  "container_size",
  "forwarder_name",
  "commodity",
  "hs_code",
  "gross_weight",
  "incoterm",
];

// This previously had no PATCH export at all (Next's auto-405 for an
// unimplemented method returns an empty body, which is what made every
// cell edit in the grid fail with "Unexpected end of JSON input" -
// EditableCell.tsx always calls res.json() on the response).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) updates[key] = value === "" ? null : value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("carrier_booking_no")) {
      return NextResponse.json(
        { error: `Booking Number "${updates.carrier_booking_no}" already exists.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // forwarder_invoices snapshots booking_number/shipping_line/pol/pod at
  // the moment a container's forwarder is synced (migration 0015) rather
  // than joining them live - so editing the source booking afterward
  // otherwise leaves any already-created invoice stale (this is what
  // Total showed correctly but POL/POD blank for imported bookings).
  const INVOICE_SYNC_MAP: Record<string, string> = {
    carrier_booking_no: "booking_number",
    carrier: "shipping_line",
    pol: "pol",
    pod: "pod",
  };
  const invoiceUpdates: Record<string, any> = {};
  for (const [bookingCol, invoiceCol] of Object.entries(INVOICE_SYNC_MAP)) {
    if (bookingCol in updates) invoiceUpdates[invoiceCol] = updates[bookingCol];
  }
  if (Object.keys(invoiceUpdates).length > 0) {
    const { data: trackingRows } = await supabase.from("tracking").select("id").eq("booking_id", params.id);
    const trackingIds = (trackingRows ?? []).map((t: any) => t.id);
    if (trackingIds.length > 0) {
      await supabase.from("forwarder_invoices").update(invoiceUpdates).in("tracking_id", trackingIds);
    }
  }

  return NextResponse.json({ booking: data });
}

// booking_parties, transport_legs, containers, tracking_events,
// trucking_jobs, charges, documents, amendments and
// booking_consignee_items all cascade from bookings.id automatically
// (see migrations 0001/0008). tracking, invoices, offers and
// rate_quotes do NOT (no ON DELETE clause) - same gap migration
// 0013_wipe_test_bookings.sql had to work around for the bulk wipe,
// handled here for a single booking instead. invoices/offers/
// rate_quotes.booking_id is nullable, so those are detached rather
// than deleted - a booking being removed shouldn't erase a real
// invoice's own record.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  for (const table of ["invoices", "offers", "rate_quotes"]) {
    await supabase.from(table).update({ booking_id: null }).eq("booking_id", params.id);
  }

  const { data: trackingRows } = await supabase.from("tracking").select("id").eq("booking_id", params.id);
  const trackingIds = (trackingRows ?? []).map((t: any) => t.id);
  if (trackingIds.length > 0) {
    await supabase.from("generated_documents").delete().in("tracking_id", trackingIds);
    for (const table of ["forwarder_invoices", "trucker_invoices", "supplier_invoices"]) {
      await supabase.from(table).update({ tracking_id: null }).in("tracking_id", trackingIds);
    }
    await supabase.from("tracking").delete().eq("booking_id", params.id);
  }

  const { error } = await supabase.from("bookings").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
