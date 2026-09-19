import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const EDITABLE_COLUMNS = ["description", "weight_kg", "unit_price", "amount"];

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Note: unlike the invoice header PATCH routes, this one does NOT
// auto-recompute `amount` when weight_kg or unit_price change -- an
// editable cell edits exactly the field the person clicked on. If they
// want amount to follow weight * price again after changing one of those,
// they can clear and re-save amount, or just type the new amount directly.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const body = await req.json();
  const supabase = createServiceClient();

  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE_COLUMNS.includes(key)) continue;
    if (key === "description") {
      updates[key] = value === "" ? null : value;
    } else {
      updates[key] = numOrNull(value);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("supplier_invoice_items")
    .update(updates)
    .eq("id", params.itemId)
    .eq("supplier_invoice_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: invoice } = await supabase
    .from("supplier_invoices")
    .select("total")
    .eq("id", params.id)
    .single();

  return NextResponse.json({ item: data, total: invoice?.total ?? 0 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("supplier_invoice_items")
    .delete()
    .eq("id", params.itemId)
    .eq("supplier_invoice_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: invoice } = await supabase
    .from("supplier_invoices")
    .select("total")
    .eq("id", params.id)
    .single();

  return NextResponse.json({ ok: true, total: invoice?.total ?? 0 });
}
