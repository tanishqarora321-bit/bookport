import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Deliberately excludes: id, company_id, booking_id, party_id, booking_number
// (that last one is denormalized FROM the booking on creation, not hand-edited
// here - if it needs to change, that's a re-assignment, not an inline edit).
const EDITABLE_COLUMNS = [
  "consignee_as_per_bl",
  "invoice_no",
  "container_number",
  "eta",
  "release_status",
  "invoice_sent",
  "documents_sent",
  "remarks",
  "bl_number",
  "bl_status",
  "ocean_freight",
  "ocean_freight_currency",
  "item_id",
  "forwarder_id",
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
    .from("tracking")
    .update(updates)
    .eq("id", params.id)
    .select("*, forwarder:forwarder_id (legal_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tracking: data });
}
