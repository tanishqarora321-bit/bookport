import { INVOICE_SLOTS } from "./slots/finalInvoice";
import { fillTemplate, fitLines, wrapForSlot } from "./templateFill";

export type TemplateConfig = {
  company_name: string;
  address_lines: string[];
  phone?: string;
  fax?: string;
  email?: string;
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
  v.footer_company = template.company_name || "";
  v.footer_by = data.signed_by || "";

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

  // Description lines: the goods line(s) flush left, charges indented.
  type Line = { text: string; indent: boolean };
  const items = (data.items ?? []).filter((it) => (it.description ?? "").trim() || Number(it.amount));
  let lines: Line[];
  let total: number;
  if (items.length > 0) {
    lines = items.map((it) => {
      const desc = (it.description ?? "").trim();
      const amount = money(it.amount);
      if (it.weight_kg != null && it.unit_price != null) {
        const lead = bales ? `${bales} Bales ` : "";
        return { text: `${lead}${desc} ${money(it.weight_kg)} ${unit}@${money(it.unit_price)}=$${amount}`, indent: false };
      }
      return { text: `${desc}  @=$${amount}`, indent: true };
    });
    total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  } else {
    const amount = money(data.amount);
    const goods = `${bales ? `${bales} Bales ` : ""}${data.description || ""} ${weight ? `${weight} ${unit}` : ""}${data.rate ? `@${data.rate}` : ""}${amount ? `=$${amount}` : ""}`;
    lines = goods.trim() ? [{ text: goods.replace(/\s+/g, " ").trim(), indent: false }] : [];
    total = parseFloat(String(data.amount || "").replace(/[^0-9.-]/g, "")) || 0;
  }
  if (lines.length > MAX_LINES) {
    const rest = lines.slice(MAX_LINES - 1).map((l) => l.text.trim()).join(" ; ");
    lines = [...lines.slice(0, MAX_LINES - 1), { text: rest, indent: true }];
  }
  lines.forEach((l, i) => (v[l.indent ? `line${i + 1}i` : `line${i + 1}`] = l.text));

  const totalText = total ? `$ ${money(total)}` : "";
  v.amount = v.cost_of_goods = v.balance_due = totalText;

  return fillTemplate("final-invoice-template.pdf", INVOICE_SLOTS, v, `Invoice ${data.invoice_no}`);
}
