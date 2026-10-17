import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const EDITABLE_COLUMNS = ["origin", "shipping_line", "rate", "free_days"];

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Corrects one AI-extracted cell (or a manually entered one) after the
// fact -- these sheets are dense enough that a wrong read here and there
// is expected, and every cell needs to stay just as editable as any other
// ledger's cells in this app.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  // rate_sheet_entries has no company_id of its own - verify the PARENT
  // sheet belongs to this company first, same as the POST route.
  const { data: sheet, error: sheetError } = await supabase
    .from("rate_sheets")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (sheetError || !sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_COLUMNS.includes(key)) continue;
    if (key === "rate" || key === "free_days") {
      updates[key] = numOrNull(value);
    } else {
      updates[key] = value === "" ? null : value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("rate_sheet_entries")
    .update(updates)
    .eq("id", params.entryId)
    .eq("rate_sheet_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const { data: sheet, error: sheetError } = await supabase
    .from("rate_sheets")
    .select("id")
    .eq("id", params.id)
    .eq("company_id", me.company_id)
    .single();
  if (sheetError || !sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("rate_sheet_entries")
    .delete()
    .eq("id", params.entryId)
    .eq("rate_sheet_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
