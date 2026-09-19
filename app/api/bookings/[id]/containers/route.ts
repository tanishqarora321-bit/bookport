import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

// Adds one container row to a booking. container_no can be left null (a
// "we know we'll have another container, number TBD" placeholder) --
// multiple null-container rows on the same booking are fine, see
// migration 0011's note on the composite key. Setting container_no here
// (non-null) fires the DB trigger that upserts a matching Shipment
// Tracking row -- see migration 0011's sync_container_to_tracking().
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("containers")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      booking_id: params.id,
      container_no: body.container_no?.toString().trim() || null,
      seal_no: body.seal_no?.toString().trim() || null,
      size_type: body.size_type?.toString().trim() || null,
    })
    .select()
    .single();

  if (error) {
    // A duplicate (booking_id, container_no) hits the unique constraint --
    // surface that plainly instead of a raw Postgres error code.
    if (error.code === "23505") {
      return NextResponse.json({ error: "This container number is already on this booking." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ container: data });
}
