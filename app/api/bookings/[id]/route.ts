import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Allow-list of columns editable from the table's inline-edit cells.
// Deliberately not "update anything sent" - an open PATCH like that would
// let a stray frontend bug (or a malicious request) overwrite columns like
// `id` or `version` that must stay system-controlled.
const EDITABLE_COLUMNS = [
  "carrier_booking_no", "erd", "si_cutoff", "cargo_cutoff",
  "pol", "pod", "final_destination", "bl_issued_at",
  "carrier", "forwarder_name", "container_size", "status"
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

  const { data, error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ booking: data });
}
