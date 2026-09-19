import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: any) {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
}

// Adds one more (origin, shipping_line) row to an already-saved sheet --
// for a lane the AI extraction missed, or a manual sheet being built up
// one row at a time.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (!body.origin || !body.shipping_line) {
    return NextResponse.json({ error: "origin and shipping_line are required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("rate_sheet_entries")
    .select("sort_order")
    .eq("rate_sheet_id", params.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("rate_sheet_entries")
    .insert({
      rate_sheet_id: params.id,
      origin: body.origin.toString().trim(),
      shipping_line: body.shipping_line.toString().trim(),
      rate: numOrNull(body.rate),
      free_days: intOrNull(body.free_days),
      sort_order: (existing?.sort_order ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
