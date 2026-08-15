import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const body = await req.json();
  const supabase = createServiceClient();

  if (typeof body.description !== "string" || !body.description.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("booking_consignee_items")
    .update({ description: body.description.trim() })
    .eq("id", params.itemId)
    .eq("booking_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("booking_consignee_items")
    .delete()
    .eq("id", params.itemId)
    .eq("booking_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
