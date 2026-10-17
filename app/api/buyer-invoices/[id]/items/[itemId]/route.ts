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
// Note: unlike the invoice header PATCH routes, this one does NOT
// auto-recompute `amount` when weight_kg or unit_price change -- an
// editable cell edits exactly the field the person clicked on.
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
