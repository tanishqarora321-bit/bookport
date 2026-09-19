import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const VALID_ROLES = ["forwarder", "trucker", "supplier", "buyer"];

// Sets (or clears) which party fills a role on this booking -- the
// Forwarder Name / Trucker Name / Supplier Name / Buyer(Consignee) picker
// cells all call this. Reuses `booking_parties`, which already existed in
// the original schema for exactly this (booking_id, party_id, role) --
// this route is the first thing that actually writes to it.
//
// One role = at most one party per booking (the picker is single-select),
// so setting a new party for a role replaces whatever was there before
// rather than adding a second row.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const role = body.role;
  const partyId = body.party_id || null;

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("booking_parties")
    .delete()
    .eq("booking_id", params.id)
    .eq("role", role);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (partyId) {
    const { error: insertError } = await supabase
      .from("booking_parties")
      .insert({ booking_id: params.id, party_id: partyId, role });

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Re-sync tracking for every container already on this booking -- a
  // forwarder/buyer change should reflect on any tracking rows that
  // already exist for it, not just future ones. Cheap re-trigger: touch
  // container_no with its own value, which fires the same DB trigger
  // migration 0011 set up (AFTER INSERT OR UPDATE OF container_no).
  const { data: containers } = await supabase
    .from("containers")
    .select("id, container_no")
    .eq("booking_id", params.id)
    .not("container_no", "is", null);

  for (const c of containers ?? []) {
    await supabase.from("containers").update({ container_no: c.container_no }).eq("id", c.id);
  }

  return NextResponse.json({ ok: true, role, party_id: partyId });
}
