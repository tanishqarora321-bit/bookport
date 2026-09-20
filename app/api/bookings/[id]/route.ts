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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ booking: data });
}
