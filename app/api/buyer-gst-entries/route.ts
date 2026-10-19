import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const EDITABLE_FIELDS = ["gst_no", "iec_code", "pan_no", "address", "mobile", "email", "description_of_goods", "hs_code", "transit_destination"];

// One record per buyer (migration 0032's unique index on buyer_party_id) -
// a buyer's own GST/IEC/PAN/shipping details, used directly as
// "Consignee as per BL" wherever that buyer is assigned to a booking, no
// separate per-booking picker needed. This is an upsert: editing a
// single field on a buyer with no record yet creates it (legal_name
// defaults to the buyer's own party name so the NOT NULL column is
// never the caller's problem); editing a field on an existing record
// just updates that field, leaving the rest untouched.
//
// buyer_gst_entries has no company_id column of its own - it's scoped
// entirely through buyer_party_id -> parties.company_id, so a caller's
// claimed buyer_party_id must be verified against the real parent party's
// company before this ever writes, or anyone could attach details to
// another company's buyer.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  if (!body.buyer_party_id) return NextResponse.json({ error: "buyer_party_id is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: buyerParty, error: buyerLookupError } = await supabase
    .from("parties")
    .select("id, legal_name")
    .eq("id", body.buyer_party_id)
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (buyerLookupError) return NextResponse.json({ error: buyerLookupError.message }, { status: 500 });
  if (!buyerParty) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // legal_name is NOT NULL and always just mirrors the buyer's own party
  // name (not user-editable here) - it has to be included on every
  // upsert call, not only when first creating the row: Postgres checks
  // NOT NULL constraints on the proposed INSERT row before it even gets
  // to evaluate ON CONFLICT, so omitting it on a later single-field edit
  // (e.g. just "mobile") would fail with a not-null violation even
  // though the row already exists and only an UPDATE would actually run.
  const updates: Record<string, any> = { buyer_party_id: body.buyer_party_id, legal_name: buyerParty.legal_name };
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key] === "" ? null : body[key];
  }

  const { data, error } = await supabase
    .from("buyer_gst_entries")
    .upsert(updates, { onConflict: "buyer_party_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
