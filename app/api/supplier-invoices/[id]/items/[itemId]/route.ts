import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";

const EDITABLE_COLUMNS = ["description", "weight_kg", "unit_price", "amount"];

function numOrNull(v: any) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Neither this item's own table nor an id/invoice-id pair alone proves it
// belongs to the caller's company - supplier_invoice_items has no
// company_id column of its own. This joins through the parent invoice
// (same join-through-parent idea used in this codebase's RLS policies) to
// confirm the item exists, belongs to THIS invoice, and that invoice
// belongs to this company, before any mutation touches it.
async function verifyItemOwnership(supabase: any, invoiceId: string, itemId: string, companyId: string) {
  const { data, error } = await supabase
    .from("supplier_invoice_items")
    .select("id, supplier_invoices!inner(company_id)")
    .eq("id", itemId)
    .eq("supplier_invoice_id", invoiceId)
    .eq("supplier_invoices.company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false as const, error };
  if (!data) return { ok: false as const, error: null };
  return { ok: true as const, error: null };
}

// NOTE: before this fix, both PATCH and DELETE below had NO auth check and
// NO company check at all - a bare `.eq("id", itemId).eq("supplier_invoice_id",
// id)` with nothing tying it back to the caller's company, same class of
// bug as the parties/[id] vulnerability.
//
// Note: unlike the invoice header PATCH routes, this one does NOT
// auto-recompute `amount` when weight_kg or unit_price change -- an
// editable cell edits exactly the field the person clicked on. If they
// want amount to follow weight * price again after changing one of those,
// they can clear and re-save amount, or just type the new amount directly.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const ownership = await verifyItemOwnership(supabase, params.id, params.itemId, me.company_id);
  if (ownership.error) return NextResponse.json({ error: ownership.error.message }, { status: 500 });
  if (!ownership.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const supabase = createServiceClient();

  const ownership = await verifyItemOwnership(supabase, params.id, params.itemId, me.company_id);
  if (ownership.error) return NextResponse.json({ error: ownership.error.message }, { status: 500 });
  if (!ownership.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
