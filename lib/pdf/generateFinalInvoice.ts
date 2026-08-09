import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type TemplateConfig = {
  company_name: string;
  address_lines: string[];
  phone?: string;
  fax?: string;
  email?: string;
  accent_color?: string;
};

export type InvoiceFieldData = {
  invoice_no: string;
  invoice_date: string; // ISO date
  consignee_name: string;
  consignee_address: string;
  booking_number: string;
  container_number: string;
  seal_number: string;
  ship_via: string; // shipping line
  terms: string;
  reference_no: string;
  weight_lbs: string;
  qty_bales: string;
  description: string;
  rate: string;
  amount: string;
  currency: string;
};

// Hex like "#0f172a" -> pdf-lib rgb(0-1 scale)
function hexToRgb(hex?: string) {
  if (!hex) return rgb(0.06, 0.09, 0.16);
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Renders the "Final Invoice" layout -- matches the real CN International
 * example: letterhead + INVOICE title top-right, Date/Invoice# box,
 * Consignee + Notify Party blocks, a booking/container/terms/ship-date/
 * ship-via/seal/reference row, then a weight/qty/description/rate/amount row.
 *
 * Company details come entirely from `template` (document_templates.template_config),
 * not hardcoded here -- a different company's layout data produces a
 * different-looking invoice from this exact same function.
 */
export async function generateFinalInvoicePdf(template: TemplateConfig, data: InvoiceFieldData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter, points
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(template.accent_color);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);

  let y = 740;
  const left = 50;
  const right = 340;

  const draw = (text: string, x: number, yy: number, opts: { font?: any; size?: number; color?: any } = {}) => {
    page.drawText(text ?? "", {
      x,
      y: yy,
      size: opts.size ?? 9,
      font: opts.font ?? font,
      color: opts.color ?? black,
    });
  };

  // ---- Letterhead ----
  draw(template.company_name, left, y, { font: bold, size: 13, color: accent });
  y -= 14;
  for (const line of template.address_lines) {
    draw(line, left, y, { size: 8.5, color: gray });
    y -= 11;
  }
  const contactBits = [
    template.phone ? `Voice: ${template.phone}` : null,
    template.fax ? `Fax: ${template.fax}` : null,
  ].filter(Boolean);
  if (contactBits.length) {
    draw(contactBits.join("  ·  "), left, y, { size: 8.5, color: gray });
    y -= 11;
  }
  if (template.email) {
    draw(`E-mail: ${template.email}`, left, y, { size: 8.5, color: gray });
  }

  // ---- INVOICE title + Date/Invoice# box (top right) ----
  draw("INVOICE", right + 90, 740, { font: bold, size: 16, color: accent });
  draw("Date", right, 715, { font: bold, size: 8.5 });
  draw("Invoice #", right + 100, 715, { font: bold, size: 8.5 });
  draw(formatDate(data.invoice_date), right, 702, { size: 9 });
  draw(data.invoice_no, right + 100, 702, { size: 9 });

  y = 660;

  // ---- Consignee / Notify blocks ----
  draw("CONSIGNEE:", left, y, { font: bold, size: 9 });
  draw("NOTIFY PARTY:", right, y, { font: bold, size: 9 });
  y -= 13;
  const consigneeLines = data.consignee_address.split("\n").filter(Boolean);
  draw(data.consignee_name, left, y, { size: 9 });
  draw(data.consignee_name, right, y, { size: 9 });
  y -= 12;
  consigneeLines.forEach((line, i) => {
    draw(line, left, y - i * 11, { size: 8.5 });
    draw(line, right, y - i * 11, { size: 8.5 });
  });
  y -= consigneeLines.length * 11 + 20;

  // ---- Booking / Container / Terms / Ship Date / Ship Via / Seal / Reference row ----
  const cols = [
    { label: "Booking #", value: data.booking_number, x: left },
    { label: "Container #", value: data.container_number, x: left + 90 },
    { label: "Terms", value: data.terms, x: left + 180 },
    { label: "Ship Date", value: formatDate(data.invoice_date), x: left + 240 },
    { label: "Ship Via", value: data.ship_via, x: left + 320 },
    { label: "Seal #", value: data.seal_number, x: left + 390 },
    { label: "Reference #", value: data.reference_no, x: left + 450 },
  ];
  page.drawLine({ start: { x: left, y: y + 12 }, end: { x: 562, y: y + 12 }, thickness: 0.5, color: gray });
  cols.forEach((c) => draw(c.label, c.x, y, { font: bold, size: 7.5 }));
  y -= 12;
  cols.forEach((c) => draw(c.value || "-", c.x, y, { size: 8 }));
  page.drawLine({ start: { x: left, y: y - 8 }, end: { x: 562, y: y - 8 }, thickness: 0.5, color: gray });
  y -= 30;

  // ---- Weight / Qty / Description / Rate / Amount row ----
  const cols2 = [
    { label: "Weight", value: `${data.weight_lbs} LBS`, x: left },
    { label: "Qty/Units", value: `${data.qty_bales} BALES`, x: left + 90 },
    { label: "Description", value: data.description, x: left + 180 },
    { label: "Rate", value: data.rate || "", x: left + 420 },
    { label: "Amount", value: `${data.currency} ${data.amount}`, x: left + 470 },
  ];
  cols2.forEach((c) => draw(c.label, c.x, y, { font: bold, size: 7.5 }));
  y -= 12;
  cols2.forEach((c) => draw(c.value, c.x, y, { size: 8 }));
  y -= 20;

  draw(
    `${data.qty_bales} Bales ${data.description} ${data.weight_lbs} LBS @ ${data.rate}=${data.currency} ${data.amount}`,
    left,
    y,
    { size: 8, color: gray }
  );

  return doc.save();
}
