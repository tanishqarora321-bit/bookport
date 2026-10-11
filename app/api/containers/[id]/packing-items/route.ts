import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Adds one more Seal No / Weight / Bales line under this container -
// "treated as a cost section" per spec, same shape as
// booking_consignee_items/supplier_invoice_items (a real child row, not
// a jsonb array), since a container can have more than one line (e.g.
// mixed cargo needing separate seal/weight breakdowns).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("container_packing_items")
    .select("sort_order")
    .eq("container_id", params.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("container_packing_items")
    .insert({
      container_id: params.id,
      seal_no: body.seal_no || null,
      weight: numOrNull(body.weight),
      weight_unit: body.weight_unit === "KG" ? "KG" : "LBS",
      bales: numOrNull(body.bales),
      description: body.description || null,
      sort_order: (existing?.sort_order ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
