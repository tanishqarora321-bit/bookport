import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const EDITABLE_COLUMNS = ["legal_name", "short_code", "country", "address", "is_active"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_COLUMNS.includes(key)) updates[key] = value === "" ? null : value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase.from("parties").update(updates).eq("id", params.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supplier: data });
}

// Hard delete, same guard as the Forwarders equivalent: only for an
// already-removed (is_active = false) supplier, failing with a friendly
// message instead of a raw FK error if it still has bookings/tracking/
// invoices referencing it.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: party, error: fetchError } = await supabase
    .from("parties")
    .select("is_active")
    .eq("id", params.id)
    .single();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (party.is_active) {
    return NextResponse.json({ error: "Remove this supplier first before deleting it permanently." }, { status: 400 });
  }

  const { error } = await supabase.from("parties").delete().eq("id", params.id);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Can't permanently delete — it still has bookings, tracking, or invoices linked to it. Keep it removed instead." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
