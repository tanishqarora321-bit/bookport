import { SOD_SLOTS, SOD_SLOTS_SAMPLE } from "./slots/setOfDocuments";
import { fillTemplate, fitLines, fmtNumber, weightKgLbs, wrapForSlot } from "./templateFill";

export type SODTemplateConfig = {
  company_name: string;
  address_lines: string[];
  bank_name?: string;
  bank_account?: string;
  account_name?: string;
  swift_code?: string;
  aba_code?: string;
  bank_address?: string;
};

export type SODFieldData = {
  invoice_no: string;
  date: string; // ISO date - BL date + 3 days, shown on every page
  consignee_name: string;
  consignee_address: string; // multi-line, \n separated
  description_of_goods: string;
  container_size: string | null; // booking's Container Size, e.g. "40HC" -> "1X 40 FCL"
  container_no: string;
  bales: string;
  weight: number | null; // the container's packing weight...
  weight_unit: string | null; // ...in this unit (KG / LBS)
  amount: number | null; // the buyer invoice total (USD)
};

// Exact copy of the owner's real 4-page Set of Documents
// (lib/pdf/assets/set-of-documents-template.pdf): Commercial Invoice,
// Packing List, Certificate of Fumigation, Certificate of Origin - every
// box, label, "CAD", "PRE-PAID", "AS CONSIGNEE", "FREIGHT PAID UPTO MUNDRA
// SEAPORT" and the company stamp stay exactly as on their sample. Filled in
// per shipment, on every page where the sample shows it:
//  - letterhead + Exporter block: the company letterhead from Settings;
//  - Date (BL date + 3 days, "22-08-2026") and Invoice No.;
//  - Consignee: the buyer's name + address (4 lines);
//  - description, container number, container size ("1X 40 FCL" - the 40
//    follows the booking's Container Size), quantity / KGS / LBS, bales,
//    amount and total;
//  - bank details from Settings (Set of Documents template) - a field
//    that's blank there keeps the sample's own value.
export async function generateSetOfDocumentsPdf(template: SODTemplateConfig, data: SODFieldData): Promise<Uint8Array> {
  const values: Record<string, string> = {};

  // Letterhead (page tops) and the Exporter box: name + 3 address lines.
  const address = fitLines((template.address_lines ?? []).map((l) => l.trim()).filter(Boolean), 3);
  values.hdr1 = values.exp1 = values.shipped_by = template.company_name;
  address.forEach((l, i) => {
    values[`hdr${i + 2}`] = l;
    values[`exp${i + 2}`] = l;
  });

  const d = new Date(`${data.date.slice(0, 10)}T00:00:00Z`);
  values.date = `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
  values.inv = data.invoice_no;

  // Consignee: name + 3 lines, wrapped to the box (~370px).
  const consigneeLines = [data.consignee_name, ...(await wrapForSlot(data.consignee_address || "", SOD_SLOTS.con1[0], 370))].filter(Boolean);
  fitLines(consigneeLines, 4).forEach((l, i) => (values[`con${i + 1}`] = l));

  // Description: one line on the Packing List / Certificate of Origin
  // pages; two centred lines in the Commercial Invoice's Description column
  // (it breaks where the sample does - "OLD AND USED WORN CLOTHING" /
  // "COMPLETELY FUMIGATED").
  values.desc = data.description_of_goods;
  const descSlot = SOD_SLOTS.desc1[0];
  const descLines = fitLines(await wrapForSlot(data.description_of_goods || "", descSlot, descSlot.right - descSlot.left + 4), 2, " ");
  values.desc1 = descLines[0] ?? "";
  values.desc2 = descLines[1] ?? "";

  values.size = (data.container_size || "").match(/\d{2}/)?.[0] ?? "40";
  values.container = data.container_no;
  values.bales = data.bales;

  const w = weightKgLbs(data.weight, data.weight_unit);
  if (w) {
    values.qty = values.tot_qty = values.kgs = fmtNumber(w.kg, 2);
    values.lbs = fmtNumber(Math.round(w.lb), 0);
  }
  if (data.amount != null && isFinite(data.amount)) {
    values.amount = fmtNumber(data.amount, 2, false); // "10415.08" in the line
    values.tot_amount = fmtNumber(data.amount, 2); // "10,415.08" in the total
  }

  // Bank details: from Settings, else exactly as on the sample.
  const bank = (v: string | undefined, key: string) => (v && v.trim() ? v.trim() : SOD_SLOTS_SAMPLE[key]);
  values.bank_name = bank(template.bank_name, "bank_name");
  values.bank_account = bank(template.bank_account, "bank_account");
  values.account_name = bank(template.account_name, "account_name");
  values.swift_code = bank(template.swift_code, "swift_code");
  values.aba_code = bank(template.aba_code, "aba_code");
  if (template.bank_address && template.bank_address.trim()) {
    const slot = SOD_SLOTS.bank_address1[0];
    const lines = fitLines(await wrapForSlot(template.bank_address, slot, slot.right - slot.left + 4), 2, " ");
    values.bank_address1 = lines[0] ?? "";
    values.bank_address2 = lines[1] ?? "";
  } else {
    values.bank_address1 = SOD_SLOTS_SAMPLE.bank_address1;
    values.bank_address2 = SOD_SLOTS_SAMPLE.bank_address2;
  }

  return fillTemplate("set-of-documents-template.pdf", SOD_SLOTS, values, `Set of Documents ${data.container_no}`);
}
