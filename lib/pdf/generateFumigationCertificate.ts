import { readFile } from "fs/promises";
import path from "path";
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFillingRgbColor,
  setFontAndSize,
  setTextMatrix,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type FumigationTemplateConfig = {
  company_name: string;
  address_lines: string[];
};

export type FumigationFieldData = {
  date: string; // ISO date - the fumigation date (BL date + 3 days)
  container_no: string;
};

// The certificate is the owner's REAL International Fumigators certificate
// (lib/pdf/assets/fumigation-certificate-template.pdf - their own Excel
// print, logo, signature and all), reproduced exactly. Per the owner only
// two things change per container: the DATE and the CONTAINER NUMBER.
// Everything else on the page - including "Located at SEATTLE USA" - stays
// exactly as on the original.
//
// How: the template is the original page with only the old date, year and
// container number taken out of its text (done once, offline);
// the new values are printed at the SAME positions, size and spacing. The original is set in Cambria (11.14pt);
// its embedded copy only holds the letters that page already uses, so the
// new values use Caladea (an open Cambria look-alike, OFL) with every
// letter placed at Cambria's own advance widths, so the spacing matches.
//
// Coordinates below come from the original's content stream, which is
// drawn in 96-dpi pixels (1px = 0.75pt, y measured from the top).
const ASSETS = path.join(process.cwd(), "lib", "pdf", "assets");
const PX = 0.75;
const PAGE_H = 792;
const FONT_PX = 14.8518; // the original's font size, in px (= 11.14pt)
const BASELINE_PX = 481.6; // the date line's baseline

// The original's cells on the date line (px):
const DATE_X = 259.9; // where "10 SEPTEMBER" was
const YEAR_X = 373.677; // the bold, underlined year (after its cell's leading space)
const CONTAINER_X = 540.583; // after "the CONTAINER NO "

// Cambria advance widths (units per em 2048), read from the original's
// embedded fonts. Digits are tabular. Letters the original doesn't contain
// fall back to Caladea's own width (visually the same design).
const CAMBRIA_REGULAR: Record<string, number> = {
  " ": 451, A: 1276, B: 1252, C: 1152, E: 1178, F: 1099, I: 664, L: 1099, M: 1670, N: 1394,
  O: 1338, P: 1163, R: 1272, S: 1016, T: 1214, U: 1327,
  "0": 1134, "1": 1134, "2": 1134, "3": 1134, "4": 1134, "5": 1134, "6": 1134, "7": 1134, "8": 1134, "9": 1134,
};
const CAMBRIA_BOLD_DIGIT = 1213;

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

function toPt(xPx: number) {
  return xPx * PX;
}
function toPtY(yPx: number) {
  return PAGE_H - yPx * PX;
}


// Draws `text` as ONE text run (so copy/search in the PDF reads it as
// typed) where every letter takes Cambria's width instead of Caladea's,
// centred in it like Cambria's own tabular digits - matching the original's
// spacing. TJ numbers are in 1/1000 of the font size; negative = move right.
function drawSpaced(page: PDFPage, font: PDFFont, text: string, xPx: number, advance: (ch: string) => number | null) {
  const size = FONT_PX * PX;
  const chars = [...text];
  const pads = chars.map((ch) => {
    const own = font.widthOfTextAtSize(ch, size);
    const units = advance(ch);
    const cell = units != null ? (units / 2048) * size : own;
    return (cell - own) / 2; // space before AND after the glyph
  });
  const items: (PDFHexString | PDFNumber)[] = [];
  chars.forEach((ch, i) => {
    if (i > 0) items.push(PDFNumber.of(-((pads[i - 1] + pads[i]) / size) * 1000));
    items.push(font.encodeText(ch));
  });
  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  const context = page.doc.context;
  page.pushOperators(
    pushGraphicsState(),
    // ActualText: copy / search reads the value exactly as typed, whatever
    // the letter spacing.
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
      PDFName.of("Span"),
      // pdf-lib's operator-argument type omits dictionaries, which BDC takes.
      context.obj({ ActualText: PDFHexString.fromText(text) }) as unknown as PDFName,
    ]),
    setFillingRgbColor(0, 0, 0),
    beginText(),
    setFontAndSize(fontKey, size),
    setTextMatrix(1, 0, 0, 1, toPt(xPx) + pads[0], toPtY(BASELINE_PX)),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [context.obj(items)]),
    endText(),
    PDFOperator.of(PDFOperatorNames.EndMarkedContent),
    popGraphicsState()
  );
}

export async function generateFumigationCertificatePdf(
  _template: FumigationTemplateConfig,
  data: FumigationFieldData
): Promise<Uint8Array> {
  const d = new Date(`${data.date.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) throw new Error(`Invalid fumigation date: ${data.date}`);
  const dayMonth = `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
  const year = String(d.getUTCFullYear());
  const container = data.container_no.trim().toUpperCase();

  const [templateBytes, regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(ASSETS, "fumigation-certificate-template.pdf")),
    readFile(path.join(ASSETS, "Caladea-Regular.ttf")),
    readFile(path.join(ASSETS, "Caladea-Bold.ttf")),
  ]);

  const doc = await PDFDocument.load(templateBytes);
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  doc.setTitle(`Fumigation Certificate ${container}`);
  doc.setProducer("Ship-Sphere");
  doc.setCreator("Ship-Sphere");

  const page = doc.getPage(0);
  drawSpaced(page, regular, dayMonth, DATE_X, (ch) => CAMBRIA_REGULAR[ch] ?? null);
  drawSpaced(page, bold, year, YEAR_X, (ch) => (/\d/.test(ch) ? CAMBRIA_BOLD_DIGIT : null));
  drawSpaced(page, regular, container, CONTAINER_X, (ch) => CAMBRIA_REGULAR[ch] ?? null);

  return doc.save();
}
