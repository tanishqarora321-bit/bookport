import { chargeKeyOf, setBuyerCharges } from "@/lib/buyer-charges";

// Writes a Final Invoice's ledger figures onto the container's Buyers ledger
// row (owner, 2026-11), so the ledger and the printed invoice never
// disagree: Date, Weight, the goods line (Item, weight x rate) and Ocean
// Freight / Commission / Trucking. Used when generating (the page's values)
// and when a version is locked (that version's own values). Everything else
// on the invoice (terms, reference, seal, ship via, bales, supplier line...)
// is print-only and stays on the version.
export async function saveInvoiceToLedger(supabase: any, companyId: string, trackingId: string, values: Record<string, any>) {
  const { data: bi } = await supabase
    .from("buyer_invoices")
    .select("id")
    .eq("tracking_id", trackingId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!bi) return false;

  const updates: Record<string, any> = {};
  if (values.invoice_date) updates.invoice_date = String(values.invoice_date).slice(0, 10);
  if (values.weight_lbs !== undefined) {
    const w = parseFloat(String(values.weight_lbs).replace(/[^0-9.]/g, ""));
    updates.weight = Number.isFinite(w) ? w : null;
  }
  if (values.weight_unit) updates.weight_unit = /^KG/i.test(values.weight_unit) ? "KG" : "LBS";
  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString();
    await supabase.from("buyer_invoices").update(updates).eq("id", bi.id);
  }

  if (Array.isArray(values.items)) {
    const { data: current } = await supabase.from("buyer_invoice_items").select("id, description, weight_kg, unit_price, amount").eq("buyer_invoice_id", bi.id);
    const goodsIds = (current ?? []).filter((it: any) => !chargeKeyOf(it)).map((it: any) => it.id);
    if (goodsIds.length) await supabase.from("buyer_invoice_items").delete().in("id", goodsIds);
    const num = (v: any) => {
      const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const rows = values.items
      .map((it: any, i: number) => {
        const w = num(it.weight_kg);
        const r = num(it.unit_price);
        const amount = w !== null && r !== null ? Math.round(w * r * 100) / 100 : num(it.amount) ?? 0;
        return { buyer_invoice_id: bi.id, description: (it.description ?? "").toString().trim() || null, weight_kg: w, unit_price: r, amount, sort_order: i };
      })
      .filter((it: any) => !chargeKeyOf(it))
      .filter((it: any) => it.description || it.weight_kg !== null || it.unit_price !== null || it.amount);
    if (rows.length) await supabase.from("buyer_invoice_items").insert(rows);
  }

  if (values.charges && typeof values.charges === "object") {
    await setBuyerCharges(supabase, bi.id, values.charges);
  }
  return true;
}
