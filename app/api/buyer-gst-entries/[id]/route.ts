import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const EDITABLE_COLUMNS = ["legal_name", "gst_no", "iec_code", "pan_no", "address", "mobile", "email", "description_of_goods", "hs_code", "transit_destination"];

// buyer_gst_entries has no company_id of its own - ownership is verified
// via its parent party (buyer_party_id -> parties.company_id) before any
// mutation below, so a guessed/leaked entry id from another company 404s
// instead of silently succeeding.
async function assertOwnedEntry(supabase: any, entryId: string, companyId: string) {
  const { data: entry, error } = await supabase.from("buyer_gst_entries").select("id, buyer_party_id").eq("id", entryId).maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!entry) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const { data: party, error: partyError } = await supabase
    .from("parties")
    .select("id")
    .eq("id", entry.buyer_party_id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (partyError) return { error: NextResponse.json({ error: partyError.message }, { status: 500 }) };
  if (!party) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  return { entry };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const owned = await assertOwnedEntry(supabase, params.id, me.company_id);
  if (owned.error) return owned.error;

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) updates[key] = value === "" ? null : value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("buyer_gst_entries")
    .update(updates)
    .eq("id", params.id)
    .eq("buyer_party_id", owned.entry.buyer_party_id)
    .select()
    .single();
  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

// Not used by the UI anymore - a buyer always has exactly one of these
// records now (migration 0032), so there's nothing left to pick and
// delete per booking. Left in place for API completeness.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const owned = await assertOwnedEntry(supabase, params.id, me.company_id);
  if (owned.error) return owned.error;

  const { error } = await supabase.from("buyer_gst_entries").delete().eq("id", params.id).eq("buyer_party_id", owned.entry.buyer_party_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
