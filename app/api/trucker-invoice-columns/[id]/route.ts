import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";

// Custom charge columns are shared across every trucker's ledger
// (migration 0022), so deleting one isn't scoped to "this trucker" -
// it's only safe once every trucker's invoices have it at 0 (or
// unset). Checked company-wide here, not just for whichever ledger the
// delete was clicked from.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient();

  const { data: column, error: colError } = await supabase
    .from("trucker_invoice_custom_columns")
    .select("key, label")
    .eq("id", params.id)
    .single();
  if (colError || !column) return NextResponse.json({ error: "Column not found" }, { status: 404 });

  const { data: invoices, error: invError } = await supabase
    .from("trucker_invoices")
    .select("id, custom_charges")
    .eq("company_id", DEFAULT_COMPANY_ID);
  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

  const rowsWithKey = (invoices ?? []).filter((inv: { id: string; custom_charges: Record<string, number> | null }) => column.key in (inv.custom_charges ?? {}));
  const hasNonZero = rowsWithKey.some((inv: { id: string; custom_charges: Record<string, number> | null }) => Number(inv.custom_charges?.[column.key]) > 0);
  if (hasNonZero) {
    return NextResponse.json(
      { error: `"${column.label}" still has a non-zero value on at least one trucker's invoice - clear it everywhere first.` },
      { status: 400 }
    );
  }

  // Strip the (all-zero) key from every row that has it, then remove
  // the column definition itself.
  for (const inv of rowsWithKey) {
    const { [column.key]: _removed, ...rest } = inv.custom_charges ?? {};
    await supabase.from("trucker_invoices").update({ custom_charges: rest }).eq("id", inv.id);
  }

  const { error: deleteError } = await supabase.from("trucker_invoice_custom_columns").delete().eq("id", params.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
