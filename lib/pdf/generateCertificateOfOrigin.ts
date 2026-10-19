import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { makeDrawer, formatDateShort } from "./pdfHelpers";

export type COOTemplateConfig = {
  company_name: string;
  address_lines: string[];
  contact_name?: string;
  phone?: string;
  trade_association?: string; // "US CHAMBER OF COMMERCE"
  place?: string; // "NEW YORK, USA" - where it's signed
};

export type COOFieldData = {
  consignee_name: string;
  consignee_address: string; // multi-line, \n separated
  description_of_goods: string;
  container_no: string;
  seal_no: string;
  bales: string;
  gross_weight: string;
  weight_unit: string;
  origin_country: string; // "USA"
  date: string; // ISO date (BL date + 3 days)
};

// Matches the real "CERTIFICATE OF ORIGIN" sample: exporter letterhead
// left / consignee right, a goods+container table, a Chamber of Commerce
// certification block at the bottom. Labeled "SEAL NO." rather than the
// sample's "SEAL#" per Tanishq's explicit note not to print the "#".
export async function generateCertificateOfOriginPdf(template: COOTemplateConfig, data: COOFieldData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const draw = makeDrawer(page, font);

  const left = 50;
  const right = 320;
  let y = 745;

  draw("CERTIFICATE OF ORIGIN", 190, y, { font: bold, size: 15 });
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: 562, y }, thickness: 0.75, color: black });
  y -= 25;

  // Exporter (left)
  draw(template.company_name, left, y, { font: bold, size: 10 });
  let ey = y - 13;
  template.address_lines.forEach((line) => {
    draw(line, left, ey, { size: 8.5 });
    ey -= 11;
  });
  if (template.contact_name) {
    draw(`CONTACT - ${template.contact_name}`, left, ey, { size: 8.5 });
    ey -= 11;
  }
  if (template.phone) {
    draw(`TEL ${template.phone}`, left, ey, { size: 8.5 });
    ey -= 11;
  }

  // Consignee (right)
  draw("CONSIGNEE", right, y, { font: bold, size: 9 });
  let cy = y - 13;
  draw(data.consignee_name, right, cy, { size: 8.5 });
  cy -= 11;
  (data.consignee_address || "").split("\n").filter(Boolean).forEach((line) => {
    draw(line, right, cy, { size: 8.5 });
    cy -= 11;
  });

  y = Math.min(ey, cy) - 25;

  draw("PARTICULARS OF TRANSPORT (WHERE REQUIRED)", left, y, { font: bold, size: 8.5 });
  y -= 13;
  draw("SEA - 0", left, y, { size: 8.5 });
  y -= 25;

  draw("MARKS & NUMBERS: DESCRIPTION OF THE GOODS", left, y, { font: bold, size: 8 });
  draw("QUANTITY", left + 320, y, { font: bold, size: 8 });
  draw("GROSS WEIGHT", left + 420, y, { font: bold, size: 8 });
  y -= 13;
  page.drawLine({ start: { x: left, y: y + 4 }, end: { x: 562, y: y + 4 }, thickness: 0.5, color: gray });
  y -= 8;

  draw(data.description_of_goods, left, y, { size: 9 });
  y -= 18;

  draw("CONTAINER", left, y, { font: bold, size: 8 });
  draw("SEAL NO.", left + 110, y, { font: bold, size: 8 });
  draw("BALES", left + 200, y, { font: bold, size: 8 });
  y -= 13;
  draw(data.container_no, left, y, { size: 9 });
  draw(data.seal_no, left + 110, y, { size: 9 });
  draw(data.bales, left + 200, y, { size: 9 });
  const weightText = `${data.gross_weight} ${data.weight_unit}`;
  draw(weightText, left + 320, y, { size: 9 });
  draw(weightText, left + 420, y, { size: 9 });
  y -= 25;

  page.drawLine({ start: { x: left, y: y + 12 }, end: { x: 562, y: y + 12 }, thickness: 0.5, color: gray });
  draw("GRAND TOTAL", left + 180, y, { font: bold, size: 9 });
  draw(data.bales, left + 260, y, { size: 9 });
  draw(weightText, left + 320, y, { size: 9 });
  draw(weightText, left + 420, y, { size: 9 });
  y -= 40;

  page.drawLine({ start: { x: left, y: y + 15 }, end: { x: 562, y: y + 15 }, thickness: 0.75, color: black });

  draw("NAME OF AUTHORIZED TRADE ASSOCIATION", left, y, { font: bold, size: 8 });
  draw("IT IS HEREBY CERTIFIED THAT THE ABOVE MENTIONED GOODS", right, y, { size: 8 });
  y -= 13;
  draw(template.trade_association || "US CHAMBER OF COMMERCE", left, y, { font: bold, size: 9 });
  draw(`ORIGINATE IN: ${data.origin_country}`, right, y, { size: 8.5 });
  y -= 15;
  draw("THE UNDERSIGNED HAS EXAMINED THE MANUFACTURER'S INVOICE OF SHIPPER'S", left, y, { size: 7 });
  draw(`DATE: ${formatDateShort(data.date)}`, right, y, { size: 8.5 });
  y -= 10;
  draw("AFFIDAVIT CONCERNING THE ORIGIN OF THE MERCHANDISE, AND ACCORDING TO", left, y, { size: 7 });
  y -= 10;
  draw("THE BEST OF HIS KNOWLEDGE AND BELIEF FINDS THAT THE PRODUCTS NAMED", left, y, { size: 7 });
  draw(`PLACE: ${template.place || "NEW YORK, USA"}`, right, y, { size: 8.5 });
  y -= 10;
  draw(`ORIGINATED IN: ${data.origin_country}`, left, y, { font: bold, size: 9 });
  y -= 20;
  draw("AUTHORIZED SIGNATURE", right, y, { size: 8 });

  return doc.save();
}
