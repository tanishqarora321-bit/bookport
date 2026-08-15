import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

// Creates a new "section" (Mixed Rags / Bed Sheet / Wiper / whatever comes
// next as the company grows). `columns` is the same jsonb shape the 3
// seeded types use -- see migration 0010's header comment and
// lib/offer-sheet-compute.ts for the format. For now this is meant to be
// used by copying/adapting an existing type's columns (e.g. via the
// "Duplicate" action in the UI) rather than hand-writing JSON from
// scratch -- a friendlier column builder can come later.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Section name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.columns) || body.columns.length === 0) {
    return NextResponse.json({ error: "At least one column is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("offer_sheet_types")
    .insert({
      company_id: DEFAULT_COMPANY_ID,
      name: body.name.trim(),
      columns: body.columns,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer_sheet_type: data });
}
