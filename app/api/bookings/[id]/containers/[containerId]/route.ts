import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const EDITABLE_COLUMNS = ["container_no", "seal_no", "size_type"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; containerId: string } }
) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) updates[key] = value === "" ? null : value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("containers")
    .update(updates)
    .eq("id", params.containerId)
    .eq("booking_id", params.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This container number is already on this booking." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ container: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; containerId: string } }
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("containers")
    .delete()
    .eq("id", params.containerId)
    .eq("booking_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
