import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// One buyer can ship under several legal entity names, each with its own
// GST/IEC/address - see supabase/migrations/0023_buyer_gst_entries_and_packing.sql.
// This is the "+ Add Line" equivalent for a buyer's GST entries.
//
// buyer_gst_entries has no company_id column of its own - it's scoped
// entirely through buyer_party_id -> parties.company_id, so a caller's
// claimed buyer_party_id must be verified against the real parent party's
// company before this ever inserts, or anyone could attach a GST entry to
// another company's buyer.
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  if (!body.buyer_party_id) return NextResponse.json({ error: "buyer_party_id is required" }, { status: 400 });
  if (!body.legal_name || !body.legal_name.toString().trim()) {
    return NextResponse.json({ error: "Legal name is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: buyerParty, error: buyerLookupError } = await supabase
    .from("parties")
    .select("id")
    .eq("id", body.buyer_party_id)
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (buyerLookupError) return NextResponse.json({ error: buyerLookupError.message }, { status: 500 });
  if (!buyerParty) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("buyer_gst_entries")
    .select("sort_order")
    .eq("buyer_party_id", body.buyer_party_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("buyer_gst_entries")
    .insert({
      buyer_party_id: body.buyer_party_id,
      legal_name: body.legal_name.toString().trim(),
      gst_no: body.gst_no || null,
      iec_code: body.iec_code || null,
      pan_no: body.pan_no || null,
      address: body.address || null,
      mobile: body.mobile || null,
      email: body.email || null,
      description_of_goods: body.description_of_goods || null,
      hs_code: body.hs_code || null,
      transit_destination: body.transit_destination || null,
      sort_order: (existing?.sort_order ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
