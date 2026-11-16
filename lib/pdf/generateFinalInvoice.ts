import { INVOICE_SLOTS } from "./slots/finalInvoice";
import { fillTemplate, fitLines, wrapForSlot, type TemplateSlots } from "./templateFill";
import { BUYER_CHARGES, emptyCharges, splitBuyerItems, type BuyerCharges, type BuyerChargeKey } from "../buyer-charges";

export type TemplateConfig = {
  company_name: string;
  address_lines: string[];
  phone?: string;
  fax?: string;
  email?: string;
  signed_by?: string; // Settings > letterhead: the "By:" signatory
  accent_color?: string;
};

export type InvoiceLineItem = {
  description: string | null;
  weight_kg: number | null; // the Cost section's weight (in the invoice's weight unit)
  unit_price: number | null;
  amount: number;
};

export type InvoiceFieldData = {
  invoice_no: string;
  invoice_date: string; // ISO date - also the Ship Date, as on the owner's sample
  consignee_name: string;
  consignee_address: string;
  booking_number: string;
  container_number: string;
  seal_number: string;
  ship_via: string; // shipping line
  terms: string;
  reference_no: string;
  weight_lbs: string; // the shipment weight (in weight_unit)
  weight_unit?: string; // "LBS" (default) or "KG"
  qty_bales: string;
  description: string; // the goods line's description ("Mixed Rags") when there are no Cost section lines
  goods_description?: string; // the Description column's heading line ("OLD USED CLOTHING")
  supplier_name?: string; // the line under the charges ("GOODWILL Nashville") - the booking's Supplier
  rate: string;
  amount: string;
  currency: string;
  signed_by?: string; // "By: ..." under the company name
  // The Buyers ledger's Cost section: each line printed on its own, the
  // way the owner's sample lists them -
  //   with a weight and a rate:  "39 Bales Mixed Rags 38950 LBS@0.15=$5842.5"
  //   amount only (charges):     "  Trucking  @=$850"
  items?: InvoiceLineItem[];
  // Ocean Freight / Commission / Trucking (lib/buyer-charges.ts); when not
  // given, read from charge lines in items.
  charges?: Partial<Record<BuyerChargeKey, number | string>>;
};

const MAX_LINES = 6;

function money(n: number | string | null | undefined) {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? "").replace(/[^0-9.-]/g, ""));
  if (!isFinite(v)) return "";
  // Plain number like the sample ("$5842.5", "$ 8929"), at most 2 decimals.
  return String(Math.round(v * 100) / 100);
}

function dmy(iso: string) {
  const d = new Date(`${(iso || "").slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

// Exact copy of the owner's real INVOICE (lib/pdf/assets/final-invoice-
// template.pdf): boxes, headings, "TOTAL AMOUNT CIF MUNDRA PORT", the
// certification text and "Payments/Credits $" stay exactly as printed.
// Filled in: the letterhead (Settings, in capitals like the sample), Date +
// Invoice #, Consignee + Notify Party (both the buyer, as on the sample),
// the Booking / Container / Terms / Ship Date / Ship Via / Seal / Reference
// row, Weight + Qty, the Description column (goods heading, one line per
// Cost section item, supplier name, total weight), and Amount / Cost of Goods /
// Balance Due (= the sum of the lines).
export async function generateFinalInvoicePdf(template: TemplateConfig, data: InvoiceFieldData): Promise<Uint8Array> {
  const v: Record<string, string> = {};
  const unit = (data.weight_unit || "LBS").toUpperCase().startsWith("KG") ? "KG" : "LBS";

  // Letterhead: name, 2 address lines, VOICE / FAX, E-mail.
  v.hdr1 = (template.company_name || "").toUpperCase();
  fitLines((template.address_lines ?? []).map((l) => l.trim()).filter(Boolean), 2).forEach((l, i) => (v[`hdr${i + 2}`] = l.toUpperCase()));
  const voice = [template.phone ? `VOICE: ${template.phone}` : "", template.fax ? `FAX: ${template.fax}` : ""].filter(Boolean).join(" - ");
  v.hdr4 = voice;
  v.hdr5 = template.email ? `E-mail: ${template.email}` : "";
  // "CNINTERNATIONALUSA INC. / By: NITIN SINGLA" - capitals, as on the
  // owner's invoice ("By:" itself is part of the template).
  v.footer_company = (template.company_name || "").toUpperCase();
  v.footer_by = (data.signed_by || template.signed_by || "").toUpperCase();

  v.date = dmy(data.invoice_date);
  v.inv = data.invoice_no;

  const party = [data.consignee_name, ...(await wrapForSlot(data.consignee_address || "", INVOICE_SLOTS.con1[0], 300))].filter(Boolean);
  fitLines(party, 4).forEach((l, i) => {
    v[`con${i + 1}`] = l;
    v[`notify${i + 1}`] = l;
  });

  v.booking = data.booking_number;
  v.container = data.container_number;
  v.terms = data.terms;
  v.ship_date = dmy(data.invoice_date);
  v.ship_via = data.ship_via;
  v.seal = data.seal_number;
  v.reference = data.reference_no;

  const weight = (data.weight_lbs || "").trim();
  const bales = (data.qty_bales || "").trim();
  v.weight = weight ? `${weight} ${unit}` : "";
  v.qty = bales ? `${bales} BALES` : "";
  v.desc = data.goods_description || "";
  v.location = data.supplier_name || ""; // template slot under the charges
  v.total_weight = weight ? `TOTAL WEIGHT ${weight} ${unit}` : "";

  // Description column (owner, 2026-11):
  //   goods line(s)  "36 Bales Mixed Rags 18056 KG"   Rate: 0.15   Amount: $ 2708.4
  //   charges        "Trucking" / "Commission" / "Ocean Freight", indented,
  //                  amount only - a charge of 0 isn't printed at all;
  //   the Supplier just below the last line; Cost of Goods / Balance Due =
  //   goods + charges. Nothing in the description carries "=$...".
  type Line = { text: string; indent: boolean; rate?: string; amount?: string };
  const split = splitBuyerItems((data.items ?? []).filter((it) => (it.description ?? "").trim() || Number(it.amount) || it.weight_kg != null));
  const charges: BuyerCharges = emptyCharges();
  for (const c of BUYER_CHARGES) {
    const given = data.charges?.[c.key];
    charges[c.key] = given !== undefined && given !== null && String(given) !== "" ? Number(String(given).replace(/[^0-9.-]/g, "")) || 0 : split.charges[c.key];
  }
  const lines: Line[] = [];
  let total = 0;
  if (split.goods.length > 0) {
    split.goods.forEach((it, i) => {
      const desc = (it.description ?? "").trim();
      const lead = i === 0 && bales ? `${bales} Bales ` : "";
      const w = it.weight_kg != null ? `${money(it.weight_kg)} ${unit}` : "";
      const amt = Number(it.amount) || 0;
      total += amt;
      lines.push({
        text: `${lead}${desc} ${w}`.replace(/\s+/g, " ").trim(),
        indent: false,
        rate: it.unit_price != null ? money(it.unit_price) : undefined,
        amount: amt ? money(amt) : undefined,
      });
    });
  } else {
    const rate = (data.rate || "").trim();
    let amt = parseFloat(String(data.amount || "").replace(/[^0-9.-]/g, "")) || 0;
    const wNum = parseFloat(weight.replace(/[^0-9.]/g, ""));
    const rNum = parseFloat(rate.replace(/[^0-9.]/g, ""));
    if (!amt && Number.isFinite(wNum) && Number.isFinite(rNum)) amt = Math.round(wNum * rNum * 100) / 100;
    total += amt;
    const text = `${bales ? `${bales} Bales ` : ""}${data.description || ""} ${weight ? `${weight} ${unit}` : ""}`.replace(/\s+/g, " ").trim();
    if (text || amt) lines.push({ text, indent: false, rate: rate || undefined, amount: amt ? money(amt) : undefined });
  }
  // Printed in the order of the owner's invoice: Trucking, Commission, Ocean Freight.
  for (const key of ["trucking", "commission", "ocean_freight"] as BuyerChargeKey[]) {
    const c = BUYER_CHARGES.find((x) => x.key === key)!;
    const amt = Math.round((charges[c.key] || 0) * 100) / 100;
    if (!amt) continue;
    total += amt;
    lines.push({ text: c.label, indent: true, amount: money(amt) });
  }
  if (lines.length > MAX_LINES) {
    const extra = lines.slice(MAX_LINES - 1);
    const restAmount = extra.reduce((sum, l) => sum + (parseFloat(l.amount || "") || 0), 0);
    lines.splice(MAX_LINES - 1, extra.length, { text: extra.map((l) => l.text.trim()).join(" ; "), indent: true, amount: money(restAmount) });
  }
  lines.forEach((l, i) => (v[l.indent ? `line${i + 1}i` : `line${i + 1}`] = l.text));

  const totalText = total ? `$ ${money(total)}` : "";
  v.cost_of_goods = v.balance_due = totalText;

  const slots: TemplateSlots = { ...INVOICE_SLOTS };
  lines.forEach((l, i) => {
    const lineSlot = INVOICE_SLOTS[`line${i + 1}`][0];
    // Rate centred in the Rate box (x 562-643 px); amounts right-aligned in
    // the Amount box (x 643-733 px) so the figures line up.
    slots[`rate${i + 1}`] = [{ ...lineSlot, left: 566, right: 639, align: "center" }];
    slots[`amt${i + 1}`] = [{ ...lineSlot, left: 646, right: 726, align: "right" }];
    if (l.rate) v[`rate${i + 1}`] = l.rate;
    if (l.amount) v[`amt${i + 1}`] = `$ ${l.amount}`;
  });

  // The Supplier sits just below the last line (one line's gap), in the
  // template's own font for it.
  const lastY = lines.length > 0 ? INVOICE_SLOTS[`line${lines.length}`][0].y : INVOICE_SLOTS.line1[0].y - 17.76;
  slots.location = [{ ...INVOICE_SLOTS.location[0], y: Math.min(lastY + 26.64, INVOICE_SLOTS.location[0].y) }];

  return fillTemplate("final-invoice-template.pdf", slots, v, `Invoice ${data.invoice_no}`);
}
