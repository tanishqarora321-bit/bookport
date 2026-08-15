import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const EDITABLE_COLUMNS = ["name", "columns"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase.from("offer_sheet_types").update(updates).eq("id", params.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer_sheet_type: data });
}
