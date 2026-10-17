import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Thin wrapper around the merge_parties() SQL function (migration
// 0019) - the actual repointing happens there, atomically, since it
// touches a dozen tables and a partial failure here would be worse
// than not merging at all. merge_parties() itself trusts whatever ids
// it's given with no company check of its own (see the migration), so
// BOTH ids must be verified here as belonging to the caller's own
// company before it ever runs - otherwise this is a cross-company
// data-corruption vector: someone could merge another company's party
// into their own (or vice versa), silently repointing that other
// company's bookings/invoices/GST entries.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const { keepId, mergeId, legal_name, short_code, country, address } = body;

  if (!keepId || !mergeId) {
    return NextResponse.json({ error: "keepId and mergeId are required" }, { status: 400 });
  }
  if (keepId === mergeId) {
    return NextResponse.json({ error: "Can't merge a party with itself" }, { status: 400 });
  }
  if (!legal_name || !legal_name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: bothParties, error: lookupError } = await supabase
    .from("parties")
    .select("id, company_id")
    .in("id", [keepId, mergeId]);
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const keepParty = (bothParties ?? []).find((p: { id: string; company_id: string }) => p.id === keepId);
  const mergeParty = (bothParties ?? []).find((p: { id: string; company_id: string }) => p.id === mergeId);
  if (!keepParty || !mergeParty || keepParty.company_id !== me.company_id || mergeParty.company_id !== me.company_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase.rpc("merge_parties", {
    p_keep_id: keepId,
    p_merge_id: mergeId,
    p_legal_name: legal_name.trim(),
    p_short_code: short_code?.trim() || null,
    p_country: country?.trim() || null,
    p_address: address?.trim() || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
