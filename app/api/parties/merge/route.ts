import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Thin wrapper around the merge_parties() SQL function (migration
// 0019) - the actual repointing happens there, atomically, since it
// touches a dozen tables and a partial failure here would be worse
// than not merging at all.
export async function POST(req: NextRequest) {
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
