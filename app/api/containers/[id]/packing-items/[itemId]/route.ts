import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const EDITABLE_COLUMNS = ["seal_no", "weight", "weight_unit", "bales", "description"];

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_COLUMNS.includes(key)) continue;
    if (key === "weight" || key === "bales") updates[key] = numOrNull(value);
    else if (key === "weight_unit") updates[key] = value === "KG" ? "KG" : "LBS";
    else updates[key] = value === "" ? null : value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("container_packing_items")
    .update(updates)
    .eq("id", params.itemId)
    .eq("container_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("container_packing_items").delete().eq("id", params.itemId).eq("container_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
