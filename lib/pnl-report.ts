import { normalizeContainerNo } from "@/lib/import-booking-fields";
import { splitBuyerItems } from "@/lib/buyer-charges";

// P&L (owner, 2026-11): one row per container.
//
//   Sell  = Buyer invoice + Discount from Supplier + Commission
//   Cost  = Supplier + Forwarder + Trucking + Discount to Customer + Pier Pass
//   Total = Sell - Cost
//
// Amounts are each invoice's USD total (forwarder / trucker custom number
// columns included, as on their ledgers). Commission = the Commission
// Bookings entered for that container (matched by container number, else
// booking number). Pier Pass and the two discounts are typed on the P&L page
// (pnl_adjustments). A commission booking for a container we don't track
// becomes a row of its own. Cancelled bookings are left out.
export type PnlRow = {
  key: string;
  tracking_id: string | null;
  month: string | null; // Month of Loading (YYYY-MM-DD)
  booking_number: string | null;
  container_number: string | null;
  buyer: string | null;
  supplier: string | null;
  trucker: string | null;
  forwarder: string | null;
  inv_buyer: string | null;
  inv_supplier: string | null;
  inv_forwarder: string | null;
  item: string | null;
  weight: number | null;
  weight_unit: string | null;
  freight: number; // Ocean Freight on the buyer invoice
  buyer_usd: number;
  supplier_usd: number;
  forwarder_usd: number;
  trucker_usd: number;
  commission: number;
  commission_parties: string | null;
  pier_pass: number;
  discount_to_customer: number;
  discount_from_supplier: number;
};

export function rowCost(r: PnlRow) {
  return r.supplier_usd + r.forwarder_usd + r.trucker_usd + r.discount_to_customer + r.pier_pass;
}
export function rowSell(r: PnlRow) {
  return r.buyer_usd + r.discount_from_supplier + r.commission;
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: out, error: null };
  }
}

const n = (v: any) => Number(v) || 0;

export async function buildPnlRows(supabase: any, companyId: string): Promise<{ rows: PnlRow[]; ready: boolean }> {
  const by = (table: string, select: string, orderCol = "id") =>
    fetchAll<any>((from, to) => supabase.from(table).select(select).eq("company_id", companyId).order(orderCol, { ascending: true }).range(from, to));

  const [tracking, buyers, suppliers, forwarders, truckers, fwdCols, trkCols, commissions, adjustments] = await Promise.all([
    by(
      "tracking",
      "id, booking_number, container_number, consignee_as_per_bl, item:item_id (name), forwarder:forwarder_id (legal_name), booking:booking_id (carrier_booking_no, status, erd, cargo_cutoff, si_cutoff, booking_parties (role, parties (legal_name)))"
    ),
    by("buyer_invoices", "tracking_id, invoice_number, total_usd, fx_rate, weight, weight_unit, items:buyer_invoice_items (description, weight_kg, unit_price, amount)"),
    by("supplier_invoices", "tracking_id, invoice_number, total_usd"),
    by("forwarder_invoices", "tracking_id, invoice_number, total_usd, fx_rate, custom_charges"),
    by("trucker_invoices", "tracking_id, total_usd, fx_rate, custom_charges"),
    supabase.from("forwarder_invoice_custom_columns").select("key, value_type").eq("company_id", companyId),
    supabase.from("trucker_invoice_custom_columns").select("key, value_type").eq("company_id", companyId),
    by("commission_bookings", "id, booking_number, container_number, commission_party, commission_amount, month_of_loading"),
    by("pnl_adjustments", "tracking_id, pier_pass, discount_to_customer, discount_from_supplier", "tracking_id"),
  ]);
  const ready = !commissions.error && !adjustments.error;

  const numericKeys = (cols: any) => ((cols?.data ?? []) as any[]).filter((c) => !c.value_type || c.value_type === "number").map((c) => c.key as string);
  const fwdKeys = numericKeys(fwdCols);
  const trkKeys = numericKeys(trkCols);
  const custom = (cc: any, keys: string[], fx: number) => keys.reduce((s, k) => s + n(cc?.[k]), 0) * (n(fx) || 1);

  // Per tracking row: sums (normally one invoice each) and invoice numbers.
  type Agg = { usd: number; numbers: string[] };
  const agg = () => new Map<string, Agg>();
  const add = (m: Map<string, Agg>, id: string | null, usd: number, num?: string | null) => {
    if (!id) return;
    const a = m.get(id) ?? { usd: 0, numbers: [] };
    a.usd += usd;
    if (num) a.numbers.push(num);
    m.set(id, a);
  };
  const buyerAgg = agg();
  const supplierAgg = agg();
  const forwarderAgg = agg();
  const truckerAgg = agg();
  const freightBy = new Map<string, number>();
  const weightBy = new Map<string, { w: number; unit: string }>();
  for (const b of buyers.data) {
    add(buyerAgg, b.tracking_id, n(b.total_usd), b.invoice_number);
    if (b.tracking_id) {
      const sp = splitBuyerItems(b.items ?? []);
      freightBy.set(b.tracking_id, (freightBy.get(b.tracking_id) ?? 0) + sp.charges.ocean_freight * (n(b.fx_rate) || 1));
      if (b.weight != null) weightBy.set(b.tracking_id, { w: n(b.weight), unit: b.weight_unit || "LBS" });
    }
  }
  for (const s of suppliers.data) add(supplierAgg, s.tracking_id, n(s.total_usd), s.invoice_number);
  for (const f of forwarders.data) add(forwarderAgg, f.tracking_id, n(f.total_usd) + custom(f.custom_charges, fwdKeys, f.fx_rate), f.invoice_number);
  for (const t of truckers.data) add(truckerAgg, t.tracking_id, n(t.total_usd) + custom(t.custom_charges, trkKeys, t.fx_rate));

  const adjBy = new Map<string, any>();
  for (const a of adjustments.data) adjBy.set(a.tracking_id, a);

  // Commission bookings by container (else booking number).
  const cbByContainer = new Map<string, any[]>();
  const cbByBooking = new Map<string, any[]>();
  for (const c of commissions.data) {
    const ck = normalizeContainerNo(c.container_number);
    if (ck) cbByContainer.set(ck, [...(cbByContainer.get(ck) ?? []), c]);
    else if (c.booking_number) {
      const bk = String(c.booking_number).trim().toUpperCase();
      cbByBooking.set(bk, [...(cbByBooking.get(bk) ?? []), c]);
    }
  }
  const usedCommission = new Set<string>();

  const rows: PnlRow[] = [];
  for (const t of tracking.data) {
    if (t.booking?.status === "cancelled") continue;
    const parties: { role: string; parties: { legal_name: string } | null }[] = t.booking?.booking_parties ?? [];
    const party = (role: string) => parties.find((p) => p.role === role)?.parties?.legal_name ?? null;
    const bookingNo = t.booking?.carrier_booking_no || t.booking_number || null;
    const ck = normalizeContainerNo(t.container_number);
    const cbs = [...(ck ? cbByContainer.get(ck) ?? [] : []), ...(bookingNo ? cbByBooking.get(String(bookingNo).trim().toUpperCase()) ?? [] : [])].filter(
      (c) => !usedCommission.has(c.id)
    );
    cbs.forEach((c) => usedCommission.add(c.id));
    const adj = adjBy.get(t.id);
    const w = weightBy.get(t.id);
    rows.push({
      key: t.id,
      tracking_id: t.id,
      month: t.booking?.erd || t.booking?.cargo_cutoff || t.booking?.si_cutoff || null,
      booking_number: bookingNo,
      container_number: t.container_number,
      buyer: party("buyer") || t.consignee_as_per_bl || null,
      supplier: party("supplier"),
      trucker: party("trucker"),
      forwarder: party("forwarder") || t.forwarder?.legal_name || null,
      inv_buyer: buyerAgg.get(t.id)?.numbers.join(", ") || null,
      inv_supplier: supplierAgg.get(t.id)?.numbers.join(", ") || null,
      inv_forwarder: forwarderAgg.get(t.id)?.numbers.join(", ") || null,
      item: t.item?.name ?? null,
      weight: w ? w.w : null,
      weight_unit: w ? w.unit : null,
      freight: freightBy.get(t.id) ?? 0,
      buyer_usd: buyerAgg.get(t.id)?.usd ?? 0,
      supplier_usd: supplierAgg.get(t.id)?.usd ?? 0,
      forwarder_usd: forwarderAgg.get(t.id)?.usd ?? 0,
      trucker_usd: truckerAgg.get(t.id)?.usd ?? 0,
      commission: cbs.reduce((s, c) => s + n(c.commission_amount), 0),
      commission_parties: Array.from(new Set(cbs.map((c) => c.commission_party).filter(Boolean))).join(", ") || null,
      pier_pass: n(adj?.pier_pass),
      discount_to_customer: n(adj?.discount_to_customer),
      discount_from_supplier: n(adj?.discount_from_supplier),
    });
  }

  // Commission bookings for containers we don't track: rows of their own.
  for (const c of commissions.data) {
    if (usedCommission.has(c.id)) continue;
    rows.push({
      key: `cb:${c.id}`,
      tracking_id: null,
      month: c.month_of_loading,
      booking_number: c.booking_number,
      container_number: c.container_number,
      buyer: null,
      supplier: null,
      trucker: null,
      forwarder: null,
      inv_buyer: null,
      inv_supplier: null,
      inv_forwarder: null,
      item: null,
      weight: null,
      weight_unit: null,
      freight: 0,
      buyer_usd: 0,
      supplier_usd: 0,
      forwarder_usd: 0,
      trucker_usd: 0,
      commission: n(c.commission_amount),
      commission_parties: c.commission_party,
      pier_pass: 0,
      discount_to_customer: 0,
      discount_from_supplier: 0,
    });
  }

  rows.sort((a, b) => String(a.month ?? "").localeCompare(String(b.month ?? "")) || String(a.booking_number ?? "").localeCompare(String(b.booking_number ?? "")));
  return { rows, ready };
}
