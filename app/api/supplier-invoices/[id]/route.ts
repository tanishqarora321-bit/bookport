import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function defaultAmount(weight_kg: any, unit_price: any, amount: any) {
  const explicit = numOrNull(amount);
  if (explicit !== null) return explicit;
  const weight = numOrNull(weight_kg);
  const price = numOrNull(unit_price);
  if (weight === null || price === null) return 0;
  return Math.round(weight * price * 100) / 100;
}

// Add one more cost-section row to an existing invoice (the "+ Add Line"
// button in the invoice detail view -- most real statements here have
// 1-3 description lines per invoice, occasionally more).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("supplier_invoice_items")
    .select("sort_order")
    .eq("supplier_invoice_id", params.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("supplier_invoice_items")
    .insert({
      supplier_invoice_id: params.id,
      description: body.description?.toString().trim() || null,
      weight_kg: numOrNull(body.weight_kg),
      unit_price: numOrNull(body.unit_price),
      amount: defaultAmount(body.weight_kg, body.unit_price, body.amount),
      sort_order: (existing?.sort_order ?? -1) + 1,
    })
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
