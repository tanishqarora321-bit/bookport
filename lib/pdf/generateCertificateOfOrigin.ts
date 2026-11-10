import { COO_SLOTS } from "./slots/certificateOfOrigin";
import { fillTemplate, fitLines, fmtNumber, weightKgLbs, wrapForSlot } from "./templateFill";
import { formatDateShort } from "./pdfHelpers";

export type COOTemplateConfig = {
  company_name: string;
  address_lines: string[];
  contact_name?: string;
  phone?: string;
  trade_association?: string;
  place?: string;
};

export type COOFieldData = {
  consignee_name: string;
  consignee_address: string; // multi-line, \n separated
  description_of_goods: string;
  container_no: string;
  seal_no: string;
  bales: string;
  weight: number | null; // the container's packing weight...
  weight_unit: string | null; // ...in this unit (KG / LBS)
  date: string; // ISO date (BL date + 3 days)
};

// Exact copy of the owner's real Certificate of Origin
// (lib/pdf/assets/certificate-of-origin-template.pdf): the boxes, headings,
// "SEA - 0", Chamber of Commerce block, place and stamp stay exactly as on
// their sample. Filled in per shipment:
//  - Exporter block (left): the company letterhead from Settings, in
//    capitals like the sample - name, address lines, "CONTACT - ...",
//    "TEL ..." (5 lines);
//  - Consignee block (right): the buyer's name + address (5 lines);
//  - description, container, seal, bales, quantity and gross weight (KGS),
//    the grand total row, and the date (BL date + 3 days, "22-Aug-26").
// The "#" after SEAL is removed from the template on the owner's earlier
// instruction.
export async function generateCertificateOfOriginPdf(template: COOTemplateConfig, data: COOFieldData): Promise<Uint8Array> {
  const values: Record<string, string> = {};

  const exporter = [
    template.company_name,
    ...(template.address_lines ?? []),
    template.contact_name ? `CONTACT - ${template.contact_name}` : "",
    template.phone ? `TEL ${template.phone}` : "",
  ]
    .map((l) => (l ?? "").trim().toUpperCase())
    .filter(Boolean);
  fitLines(exporter, 5).forEach((l, i) => (values[`exp${i + 1}`] = l));

  // The consignee box is ~330px wide at this size.
  const consigneeLines = [data.consignee_name, ...(await wrapForSlot(data.consignee_address || "", COO_SLOTS.con1[0], 330))].filter(Boolean);
  fitLines(consigneeLines, 5).forEach((l, i) => (values[`con${i + 1}`] = l));

  values.desc = data.description_of_goods;
  values.container = data.container_no;
  values.seal = data.seal_no;
  values.bales = data.bales;
  values.tot_bales = data.bales;

  const w = weightKgLbs(data.weight, data.weight_unit);
  if (w) {
    const kg = fmtNumber(w.kg, 3);
    values.qty = values.gross = values.tot_qty = values.tot_gross = kg;
  }

  values.date = formatDateShort(data.date);

  return fillTemplate("certificate-of-origin-template.pdf", COO_SLOTS, values, `Certificate of Origin ${data.container_no}`);
}
