// Buyer invoice charges (owner, 2026-11): Ocean Freight, Commission and
// Trucking are their own columns on the Buyers ledger and their own inputs
// on the Final Invoice page. They're stored as Cost section lines (the
// invoice total stays the database trigger's sum of all lines - Goods Value
// + the three charges) with no weight and no rate and exactly this
// description; every other line is a goods line (weight x rate = amount).
// An old import's "Freight" line counts as Ocean Freight.
export const BUYER_CHARGES = [
  { key: "ocean_freight", label: "Ocean Freight", re: /^\s*(ocean\s*)?freight\s*$/i },
  { key: "commission", label: "Commission", re: /^\s*commission\s*$/i },
  { key: "trucking", label: "Trucking", re: /^\s*trucking\s*$/i },
] as const;

export type BuyerChargeKey = (typeof BUYER_CHARGES)[number]["key"];
export type BuyerCharges = Record<BuyerChargeKey, number>;

type ItemLike = { description: string | null; weight_kg: number | null; unit_price: number | null; amount: number | string | null };

export function chargeKeyOf(item: ItemLike): BuyerChargeKey | null {
  if (item.weight_kg != null || item.unit_price != null) return null;
  const d = item.description ?? "";
  for (const c of BUYER_CHARGES) if (c.re.test(d)) return c.key;
  return null;
}

export function emptyCharges(): BuyerCharges {
  return { ocean_freight: 0, commission: 0, trucking: 0 };
}

// Splits a buyer invoice's lines into goods lines and the three charges.
export function splitBuyerItems<T extends ItemLike>(items: T[]): { goods: T[]; charges: BuyerCharges; goodsTotal: number } {
  const goods: T[] = [];
  const charges = emptyCharges();
  for (const it of items) {
    const k = chargeKeyOf(it);
    if (k) charges[k] += Number(it.amount) || 0;
    else goods.push(it);
  }
  const goodsTotal = goods.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  return { goods, charges, goodsTotal };
}

// Sets the three charges on a buyer invoice: a zero / blank value removes
// that line, anything else updates (or adds) it. The database trigger then
// recomputes the invoice total.
export async function setBuyerCharges(supabase: any, invoiceId: string, values: Partial<Record<BuyerChargeKey, number | string | null>>) {
  const { data: items, error } = await supabase
    .from("buyer_invoice_items")
    .select("id, description, weight_kg, unit_price, amount, sort_order")
    .eq("buyer_invoice_id", invoiceId);
  if (error) throw new Error(error.message);
  let nextSort = (items ?? []).reduce((m: number, it: any) => Math.max(m, Number(it.sort_order) || 0), -1) + 1;
  for (const c of BUYER_CHARGES) {
    if (!(c.key in values)) continue;
    const raw = values[c.key];
    const n = raw === null || raw === undefined || String(raw).trim() === "" ? 0 : Number(String(raw).replace(/[^0-9.-]/g, ""));
    const amount = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    const existing = (items ?? []).filter((it: any) => chargeKeyOf(it) === c.key);
    if (amount === 0) {
      if (existing.length) {
        const { error: e } = await supabase.from("buyer_invoice_items").delete().in("id", existing.map((it: any) => it.id));
        if (e) throw new Error(e.message);
      }
      continue;
    }
    if (existing.length) {
      const { error: e } = await supabase.from("buyer_invoice_items").update({ amount, description: c.label }).eq("id", existing[0].id);
      if (e) throw new Error(e.message);
      if (existing.length > 1) {
        const { error: e2 } = await supabase.from("buyer_invoice_items").delete().in("id", existing.slice(1).map((it: any) => it.id));
        if (e2) throw new Error(e2.message);
      }
    } else {
      const { error: e } = await supabase
        .from("buyer_invoice_items")
        .insert({ buyer_invoice_id: invoiceId, description: c.label, weight_kg: null, unit_price: null, amount, sort_order: nextSort++ });
      if (e) throw new Error(e.message);
    }
  }
}
