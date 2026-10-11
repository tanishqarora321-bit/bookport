import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { TemplateConfig } from "./generateFinalInvoice";

export type InstructionTemplateConfig = TemplateConfig & {
  // {destination} is replaced with the booking's Port of Delivery - the
  // rest is treated as fixed boilerplate, same on every Instructions PDF
  // (per Tanishq: "this became constant"). Editable from Settings, not
  // code, same reasoning as the rest of template_config.
  shipper_declaration?: string;
};

export type InstructionFieldData = {
  booking_number: string;
  container_number: string;
  seal_no: string;
  weight: string;
  weight_unit: string;
  bales: string;
  consignee_name: string;
  consignee_address: string;
  notify_name: string;
  notify_address: string;
  description_of_goods: string;
  hs_code: string;
  value: string;
  destination: string;
  instruction_date: string; // ISO date
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function hexToRgb(hex?: string) {
  if (!hex) return rgb(0.06, 0.09, 0.16);
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Renders the "Booking Instructions" letter (image 3's TEX POLY IMPEX
 * layout): letterhead as Shipper/Exporter, Booking/Container/Seal/
 * Weight/Bales row, Consignee & Notify Party blocks, Description of
 * Goods + H.S. Code + Value, and the constant shipper-declares clause
 * with the destination interpolated in. Company letterhead and the
 * declaration text both come from `template` (document_templates,
 * doc_type='booking_instruction'), same company-scoped, Settings-
 * editable pattern as the Final Invoice.
 */
export async function generateBookingInstructionsPdf(
  template: InstructionTemplateConfig,
  data: InstructionFieldData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter, points
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(template.accent_color);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);

  let y = 740;
  const left = 50;
  const right = 320;

  const draw = (text: string, x: number, yy: number, opts: { font?: any; size?: number; color?: any } = {}) => {
    page.drawText(text ?? "", {
      x,
      y: yy,
      size: opts.size ?? 9,
      font: opts.font ?? font,
      color: opts.color ?? black,
    });
  };

  // ---- Letterhead (doubles as the Shipper/Exporter block) ----
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

  // ---- Title + Date box (top right) ----
  draw("BOOKING INSTRUCTIONS", right - 30, 740, { font: bold, size: 14, color: accent });
  draw("Date", right, 715, { font: bold, size: 8.5 });
  draw(formatDate(data.instruction_date), right, 702, { size: 9 });

  y = 665;

  // ---- Booking / Container / Seal / Weight / Bales row ----
  // Booking No. gets real room (120pt) since it's the carrier's own free-
  // text booking number, not the short internal BP-YY-NNNN code - it can
  // run well past 10-12 characters depending on the shipping line.
  const cols = [
    { label: "Booking No.", value: data.booking_number, x: left },
    { label: "Container No.", value: data.container_number, x: left + 120 },
    { label: "Seal No.", value: data.seal_no, x: left + 230 },
    { label: "Weight", value: data.weight ? `${data.weight} ${data.weight_unit}` : "", x: left + 310 },
    { label: "Bales", value: data.bales, x: left + 410 },
  ];
  page.drawLine({ start: { x: left, y: y + 12 }, end: { x: 562, y: y + 12 }, thickness: 0.5, color: gray });
  cols.forEach((c) => draw(c.label, c.x, y, { font: bold, size: 7.5 }));
  y -= 12;
  cols.forEach((c, i) => {
    const text = c.value || "-";
    const nextX = cols[i + 1]?.x ?? 562;
    const maxWidth = nextX - c.x - 6;
    const size = 8.5;
    // Clamp to the column's own space rather than let a long carrier
    // booking number run into Container No. - better a slightly smaller
    // font than overlapping, unreadable text.
    const fittedSize = font.widthOfTextAtSize(text, size) > maxWidth ? Math.max(6, (maxWidth / font.widthOfTextAtSize(text, size)) * size) : size;
    draw(text, c.x, y, { size: fittedSize });
  });
  page.drawLine({ start: { x: left, y: y - 8 }, end: { x: 562, y: y - 8 }, thickness: 0.5, color: gray });
  y -= 30;

  // ---- Consignee / Notify Party blocks ----
  draw("CONSIGNEE:", left, y, { font: bold, size: 9 });
  draw("NOTIFY PARTY:", right, y, { font: bold, size: 9 });
  y -= 13;
  const consigneeLines = data.consignee_address.split("\n").filter(Boolean);
  const notifyLines = data.notify_address.split("\n").filter(Boolean);
  draw(data.consignee_name, left, y, { size: 9 });
  draw(data.notify_name, right, y, { size: 9 });
  y -= 12;
  consigneeLines.forEach((line, i) => draw(line, left, y - i * 11, { size: 8.5 }));
  notifyLines.forEach((line, i) => draw(line, right, y - i * 11, { size: 8.5 }));
  y -= Math.max(consigneeLines.length, notifyLines.length) * 11 + 24;

  // ---- Description of Goods / H.S. Code / Value ----
  page.drawLine({ start: { x: left, y: y + 12 }, end: { x: 562, y: y + 12 }, thickness: 0.5, color: gray });
  draw("Description of Goods", left, y, { font: bold, size: 7.5 });
  draw("H.S. Code", left + 320, y, { font: bold, size: 7.5 });
  draw("Value", left + 420, y, { font: bold, size: 7.5 });
  y -= 12;
  draw(data.description_of_goods || "-", left, y, { size: 8.5 });
  draw(data.hs_code || "-", left + 320, y, { size: 8.5 });
  draw(data.value || "-", left + 420, y, { size: 8.5 });
  page.drawLine({ start: { x: left, y: y - 8 }, end: { x: 562, y: y - 8 }, thickness: 0.5, color: gray });
  y -= 40;

  // ---- Shipper declares clause (constant, destination interpolated) ----
  const declaration =
    (template.shipper_declaration || "SHIPPER DECLARES THAT THE ABOVE PARTICULARS ARE TRUE AND CORRECT AND THIS SHIPMENT IS DESTINED FOR {destination}.").replace(
      "{destination}",
      data.destination || ""
    );
  const words = declaration.split(" ");
  const maxWidth = 500;
  let line = "";
  const declarationLines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, 8) > maxWidth) {
      declarationLines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) declarationLines.push(line);
  declarationLines.forEach((l, i) => draw(l, left, y - i * 11, { size: 8, color: gray }));

  return doc.save();
}
