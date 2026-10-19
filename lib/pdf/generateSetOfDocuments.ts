import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { makeDrawer, formatDateDMY } from "./pdfHelpers";

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
  // "1X 40 FCL" style container count/type descriptor - from the
  // booking's own Container Size field (Booking & Instructions), or
  // typed in manually there if blank. Not derived from the BL.
  container_line: string;
  container_no: string;
  bales: string;
  weight_lbs: string;
  weight_kgs: string;
  amount: string;
  currency: string;
};

const PAGE_SIZE: [number, number] = [612, 792];

function drawLetterheadAndDateBox(
  page: PDFPage,
  template: SODTemplateConfig,
  data: SODFieldData,
  font: PDFFont,
  bold: PDFFont,
  title: string
) {
  const left = 50;
  const black = rgb(0.1, 0.1, 0.1);
  const draw = makeDrawer(page, font);
  let y = 740;

  draw(template.company_name, left, y, { font: bold, size: 16, color: black });
  y -= 16;
  template.address_lines.forEach((line) => {
    draw(line, left, y, { size: 9 });
    y -= 11;
  });

  draw(title, 220, 695, { font: bold, size: 14 });

  draw("Date", 420, 720, { font: bold, size: 8.5 });
  draw("Invoice No.", 490, 720, { font: bold, size: 8.5 });
  page.drawLine({ start: { x: 415, y: 715 }, end: { x: 562, y: 715 }, thickness: 0.5, color: black });
  draw(formatDateDMY(data.date), 420, 703, { size: 9 });
  draw(data.invoice_no, 490, 703, { size: 9 });

  return y - 20;
}

function drawExporterConsignee(page: PDFPage, template: SODTemplateConfig, data: SODFieldData, font: PDFFont, bold: PDFFont, startY: number) {
  const left = 50;
  const right = 320;
  const draw = makeDrawer(page, font);
  let y = startY;

  draw("EXPORTER", left, y, { font: bold, size: 9 });
  draw("CONSIGNEE", right, y, { font: bold, size: 9 });
  y -= 13;
  draw(template.company_name, left, y, { size: 8.5 });
  draw(data.consignee_name, right, y, { size: 8.5 });
  let ly = y - 11;
  let ry = y - 11;
  template.address_lines.forEach((line) => {
    draw(line, left, ly, { size: 8.5 });
    ly -= 11;
  });
  (data.consignee_address || "").split("\n").filter(Boolean).forEach((line) => {
    draw(line, right, ry, { size: 8.5 });
    ry -= 11;
  });

  return Math.min(ly, ry) - 15;
}

/**
 * Renders the 4-page "Set of Documents" packet exactly matching
 * Tanishq's real example: Commercial Invoice, Packing List, a short
 * self-issued Certificate of Fumigation, and a short self-issued
 * Certificate of Origin - all on the company's own letterhead (distinct
 * from the full third-party Fumigation Certificate and the full
 * Chamber-of-Commerce Certificate of Origin, which are separate standalone
 * documents - see generateFumigationCertificate.ts / generateCertificateOfOrigin.ts).
 * Every page shows the same Date (BL date + 3 days) and Invoice Number
 * (the one already generated via Buyers & Customers' Generate Invoice).
 */
export async function generateSetOfDocumentsPdf(template: SODTemplateConfig, data: SODFieldData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const left = 50;

  // ---- Page 1: Commercial Invoice ----
  {
    const page = doc.addPage(PAGE_SIZE);
    const draw = makeDrawer(page, font);
    let y = drawLetterheadAndDateBox(page, template, data, font, bold, "COMMERCIAL INVOICE");
    y = drawExporterConsignee(page, template, data, font, bold, y);

    draw("P.O.Number", left, y, { font: bold, size: 7.5 });
    draw("Terms", left + 90, y, { font: bold, size: 7.5 });
    draw("Ship Via", left + 320, y, { font: bold, size: 7.5 });
    draw("Freight", left + 450, y, { font: bold, size: 7.5 });
    y -= 12;
    draw("CAD", left + 90, y, { size: 8 });
    draw("PRE-PAID", left + 450, y, { size: 8 });
    y -= 25;

    page.drawLine({ start: { x: left, y: y + 14 }, end: { x: 562, y: y + 14 }, thickness: 0.5, color: gray });
    draw("Quantity", left, y, { font: bold, size: 7.5 });
    draw("Description", left + 90, y, { font: bold, size: 7.5 });
    draw("Bales", left + 420, y, { font: bold, size: 7.5 });
    draw("Amount", left + 470, y, { font: bold, size: 7.5 });
    y -= 13;
    page.drawLine({ start: { x: left, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 0.5, color: gray });
    y -= 4;

    draw(data.weight_kgs, left, y, { size: 8.5 });
    draw(data.description_of_goods, left + 90, y, { size: 8.5 });
    draw(data.bales, left + 420, y, { size: 8.5 });
    draw(`${data.currency} ${data.amount}`, left + 470, y, { size: 8.5 });
    y -= 16;
    draw("ROUND OFF", left + 90, y, { size: 8.5 });
    y -= 14;
    draw("FREIGHT PAID UPTO MUNDRA SEAPORT", left + 90, y, { size: 8.5 });
    y -= 20;
    draw(data.container_line, left + 90, y, { size: 8.5 });
    y -= 14;
    draw(data.container_no, left + 90, y, { size: 8.5 });
    y -= 30;

    page.drawLine({ start: { x: left, y: y + 14 }, end: { x: 562, y: y + 14 }, thickness: 0.5, color: gray });
    draw(data.weight_kgs, left, y, { size: 8.5 });
    y -= 16;
    draw("TOTAL", left + 400, y, { font: bold, size: 9 });
    draw(`${data.currency} ${data.amount}`, left + 470, y, { font: bold, size: 9 });
    y -= 40;

    draw("We hereby certify that the invoice is true & correct. All the above", left, y, { size: 7, color: gray });
    y -= 10;
    draw("declared merchandise of U.S.A. Origin", left, y, { size: 7, color: gray });
    y -= 30;
    draw(template.company_name, left, y, { size: 9 });
    y -= 40;

    if (template.bank_name) {
      draw(`BANK NAME: ${template.bank_name}`, left, y, { size: 7.5, color: gray });
      y -= 10;
      if (template.bank_account) draw(`BANK A/C: ${template.bank_account}`, left, y, { size: 7.5, color: gray });
      y -= 10;
      if (template.account_name) draw(`A/C NAME: ${template.account_name}`, left, y, { size: 7.5, color: gray });
      y -= 10;
      if (template.swift_code) draw(`SWIFT CODE: ${template.swift_code}`, left, y, { size: 7.5, color: gray });
      y -= 10;
      if (template.aba_code) draw(`ABA CODE: ${template.aba_code}`, left, y, { size: 7.5, color: gray });
      y -= 10;
      if (template.bank_address) draw(`BANK ADD: ${template.bank_address}`, left, y, { size: 7.5, color: gray });
    }
  }

  // ---- Page 2: Packing List ----
  {
    const page = doc.addPage(PAGE_SIZE);
    const draw = makeDrawer(page, font);
    let y = drawLetterheadAndDateBox(page, template, data, font, bold, "PACKING LIST");
    y = drawExporterConsignee(page, template, data, font, bold, y);
    y -= 15;

    draw("DESCRIPTION:", left, y, { font: bold, size: 8.5 });
    draw(data.description_of_goods, left + 70, y, { size: 8.5 });
    y -= 30;

    draw("MERCHANDISE SHIPPED IN GOOD ORDER AND CONDITION BY", left, y, { size: 8.5 });
    y -= 12;
    draw(template.company_name, left, y, { size: 8.5 });
    y -= 40;

    draw("CONTAINER NO.", left, y, { font: bold, size: 8 });
    draw("LBS", left + 140, y, { font: bold, size: 8 });
    draw("KGS", left + 210, y, { font: bold, size: 8 });
    draw("BALES", left + 280, y, { font: bold, size: 8 });
    y -= 14;
    draw(data.container_no, left, y, { size: 9 });
    draw(data.weight_lbs, left + 140, y, { size: 9 });
    draw(data.weight_kgs, left + 210, y, { size: 9 });
    draw(data.bales, left + 280, y, { size: 9 });
  }

  // ---- Page 3: (short, self-issued) Certificate of Fumigation ----
  {
    const page = doc.addPage(PAGE_SIZE);
    const draw = makeDrawer(page, font);
    let y = drawLetterheadAndDateBox(page, template, data, font, bold, "CERTIFICATE OF FUMIGATION");

    draw("To", left, y, { size: 9 });
    y -= 13;
    draw(data.consignee_name, left, y, { size: 8.5 });
    let ty = y - 11;
    (data.consignee_address || "").split("\n").filter(Boolean).forEach((line) => {
      draw(line, left, ty, { size: 8.5 });
      ty -= 11;
    });
    y = ty - 25;

    draw("CERTIFICATE OF FUMIGATION", left, y, { font: bold, size: 12 });
    y -= 30;

    draw(`${data.container_line} : - ${data.container_no}`, left, y, { size: 10 });
    y -= 30;

    draw("As per the terms of above mentioned Order & further as detailed and described in our invoice", left, y, { size: 8.5 });
    y -= 13;
    draw("We certify that the concerning goods have been fumigated before packing, pressing and", left, y, { size: 8.5 });
    y -= 13;
    draw("shipment and further we refer to above mentioned numbers.", left, y, { size: 8.5 });
  }

  // ---- Page 4: (short, self-issued) Certificate of Origin ----
  {
    const page = doc.addPage(PAGE_SIZE);
    const draw = makeDrawer(page, font);
    let y = drawLetterheadAndDateBox(page, template, data, font, bold, "CERTIFICATE OF ORIGIN");

    draw("To", left, y, { size: 9 });
    y -= 13;
    draw(data.consignee_name, left, y, { size: 8.5 });
    let ty = y - 11;
    (data.consignee_address || "").split("\n").filter(Boolean).forEach((line) => {
      draw(line, left, ty, { size: 8.5 });
      ty -= 11;
    });
    y = ty - 25;

    draw(`${data.container_line} : - ${data.container_no}`, left, y, { size: 10 });
    y -= 20;
    draw("DESCRIPTION:", left, y, { font: bold, size: 9 });
    draw(`${data.bales} ${data.description_of_goods}`, left + 70, y, { size: 9 });
    y -= 30;

    draw("CERTIFICATE OF ORIGIN", left, y, { font: bold, size: 12 });
    y -= 30;

    draw("As per the terms of above mentioned Order & further as detailed and described in our invoice,", left, y, { size: 8.5 });
    y -= 13;
    draw("also as mentioned above, we hereby certify, that the concerning goods are of USA origin.", left, y, { size: 8.5 });
  }

  return doc.save();
}
