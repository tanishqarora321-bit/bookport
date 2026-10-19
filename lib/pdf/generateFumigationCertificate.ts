import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { makeDrawer, formatDateLong } from "./pdfHelpers";

export type FumigationTemplateConfig = {
  company_name: string;
  address_lines: string[];
};

export type FumigationFieldData = {
  date: string; // ISO date - the fumigation date (BL date + 3 days)
  container_no: string;
  location: string; // e.g. "SEATTLE USA"
};

// Matches the real third-party "INTERNATIONAL FUMIGATORS, INC." certificate
// Tanishq actually uses, including its own "CERITIFICATE OF TREATMENT"
// heading exactly as printed (this reproduces a real certificate, not
// original copy - not "corrected" to the standard spelling). Everything
// except date/container/location is fixed boilerplate - the fumigant,
// rate, duration and temperature never vary per his own example, so
// `template` only carries the fumigator's own name/address, not a full
// letterhead config like the company's own documents use.
export async function generateFumigationCertificatePdf(
  template: FumigationTemplateConfig,
  data: FumigationFieldData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  const draw = makeDrawer(page, font);

  const left = 72;
  let y = 740;

  template.address_lines.forEach((line, i) => draw(line, 380, y - i * 12, { size: 9, font: bold, color: black }));

  y -= 90;
  draw(template.company_name, left, y, { font: bold, size: 22, color: black });
  y -= 34;
  draw("CERITIFICATE OF TREATMENT", left, y, { font: bold, size: 13, color: black });
  y -= 40;

  draw("TO WHOM IT MAY CONCERN:", left, y, { font: bold, size: 10 });
  y -= 30;

  draw(`This will confirm that on ${formatDateLong(data.date)} the CONTAINER NO ${data.container_no}`, left, y, { size: 11 });
  y -= 24;
  draw(`Located at ${data.location} was`, left, y, { size: 11 });
  y -= 24;
  draw("Fumigated with METHYLBROMIDE at", left, y, { size: 11 });
  y -= 24;
  draw("The rate of 3 USD PER 1000 CUBE METERS OF SPACE", left, y, { size: 11 });
  y -= 24;
  draw("for A minimum period of 24 HOURS.", left, y, { size: 11 });
  y -= 24;
  draw("The cargo temperature was Above 70DEGS F.", left, y, { size: 11 });
  y -= 70;

  draw(template.company_name, left + 170, y, { size: 10, font: bold });

  return doc.save();
}
