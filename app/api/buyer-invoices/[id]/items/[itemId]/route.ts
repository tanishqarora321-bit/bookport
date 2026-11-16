import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const EDITABLE_COLUMNS = ["description", "weight_kg", "unit_price", "amount"];

// buyer_invoice_items has no company_id of its own - verify the parent
// invoice belongs to this company before touching one of its line items.
async function assertOwnedInvoice(supabase: any, invoiceId: string, companyId: string) {
  const { data, error } = await supabase.from("buyer_invoices").select("id").eq("id", invoiceId).eq("company_id", companyId).maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return {};
}

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Mirrors app/api/supplier-invoices/[id]/items/[itemId]/route.ts exactly.
// Cost section = goods lines (owner, 2026-11): when a line has both a
// weight and a unit price, its amount is always weight x unit price -
// changing either recomputes it. A line without both keeps the amount
// typed in (e.g. an imported "Invoice Value").
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const owned = await assertOwnedInvoice(supabase, params.id, me.company_id);
  if (owned.error) return owned.error;

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

  if ("weight_kg" in updates || "unit_price" in updates) {
    const { data: cur } = await supabase
      .from("buyer_invoice_items")
      .select("weight_kg, unit_price")
      .eq("id", params.itemId)
      .eq("buyer_invoice_id", params.id)
      .maybeSingle();
    const w = "weight_kg" in updates ? updates.weight_kg : cur?.weight_kg;
    const p = "unit_price" in updates ? updates.unit_price : cur?.unit_price;
    if (w != null && p != null) updates.amount = Math.round(Number(w) * Number(p) * 100) / 100;
  }

  const { data, error } = await supabase
    .from("buyer_invoice_items")
    .update(updates)
    .eq("id", params.itemId)
    .eq("buyer_invoice_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: invoice } = await supabase
    .from("buyer_invoices")
    .select("total")
    .eq("id", params.id)
    .single();

  return NextResponse.json({ item: data, total: invoice?.total ?? 0 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const owned = await assertOwnedInvoice(supabase, params.id, me.company_id);
  if (owned.error) return owned.error;

  const { error } = await supabase
    .from("buyer_invoice_items")
    .delete()
    .eq("id", params.itemId)
    .eq("buyer_invoice_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: invoice } = await supabase
    .from("buyer_invoices")
    .select("total")
    .eq("id", params.id)
    .single();

  return NextResponse.json({ ok: true, total: invoice?.total ?? 0 });
}
