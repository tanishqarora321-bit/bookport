import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// Exact-copy documents (Certificate of Origin, Set of Documents): the
// owner's own sample PDF is the template - every line, box, logo and stamp
// stays exactly as printed. Only the per-shipment values were taken out of
// its text (once, offline), and their positions recorded as "slots"
// (lib/pdf/slots/*). This prints the new values into those slots.
//
// Fonts: the samples are printed from Excel in Arial / Calibri / Times New
// Roman, which can't be shipped; Liberation Sans/Serif and Carlito are open
// (OFL) fonts with IDENTICAL letter widths. Kerning is turned off because
// Excel doesn't kern - with it off the new text spaces exactly like the
// original.
//
// Slot coordinates are in the original's 96-dpi px space (its content
// stream draws at 0.75pt per px, y measured from the top of the page).
export type SlotFont = "Arial" | "Arial Bold" | "Calibri" | "Times New Roman";
export type Slot = {
  page: number; // 1-based
  font: string;
  size: number; // px
  left: number;
  right: number;
  y: number; // baseline
  align: "left" | "center" | "right";
};
export type TemplateSlots = Record<string, Slot[]>;

const ASSETS = path.join(process.cwd(), "lib", "pdf", "assets");
const PX = 0.75;
const FONT_FILES: Record<SlotFont, string> = {
  Arial: "LiberationSans-Regular.ttf",
  "Arial Bold": "LiberationSans-Bold.ttf",
  Calibri: "Carlito-Regular.ttf",
  "Times New Roman": "LiberationSerif-Regular.ttf",
};

// Characters these fonts can't show (Excel's soft/real hyphens) become a
// plain hyphen, which has the same width in the originals.
function clean(text: string) {
  return text.replace(/[­‐‑]/g, "-").replace(/[\r\n\t]+/g, " ");
}

export async function fillTemplate(templateFile: string, slots: TemplateSlots, values: Record<string, string | null | undefined>, title: string) {
  const doc = await PDFDocument.load(await readFile(path.join(ASSETS, templateFile)));
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setProducer("Ship-Sphere");
  doc.setCreator("Ship-Sphere");

  const fonts = new Map<string, PDFFont>();
  async function font(name: string) {
    const file = FONT_FILES[name as SlotFont];
    if (!file) throw new Error(`No font for template slot font "${name}"`);
    if (!fonts.has(name)) {
      // Carlito loses glyphs when subset (a fontkit subsetting bug, seen
      // live: "FCIU9844912" printed as "  9  9"), so it's embedded whole.
      const subset = name !== "Calibri";
      fonts.set(name, await doc.embedFont(await readFile(path.join(ASSETS, file)), { subset, features: { kern: false, liga: false } }));
    }
    return fonts.get(name)!;
  }

  const pages = doc.getPages();
  const height = pages[0]?.getHeight() ?? 792;
  for (const [key, list] of Object.entries(slots)) {
    const raw = values[key];
    if (raw == null) continue;
    const text = clean(String(raw)).trim();
    if (!text) continue;
    for (const s of list) {
      const f = await font(s.font);
      const width = f.widthOfTextAtSize(text, s.size);
      const xPx = s.align === "center" ? (s.left + s.right) / 2 - width / 2 : s.align === "right" ? s.right - width : s.left;
      pages[s.page - 1].drawText(text, {
        x: xPx * PX,
        y: height - s.y * PX,
        size: s.size * PX,
        font: f,
        color: rgb(0, 0, 0),
      });
    }
  }
  return doc.save();
}

// Splits text into lines no wider than `maxPx` in the given slot font, so
// a long address / description breaks the way it would in its box.
export async function wrapForSlot(text: string, slot: Slot, maxPx: number): Promise<string[]> {
  const file = FONT_FILES[slot.font as SlotFont];
  const f = fontkit.create(await readFile(path.join(ASSETS, file))) as any;
  const width = (t: string) => (f.layout(t, { kern: false, liga: false }).advanceWidth / f.unitsPerEm) * slot.size;
  const out: string[] = [];
  for (const para of (text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const words = clean(para).trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && width(next) > maxPx) {
        out.push(line);
        line = w;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

// Puts `lines` into `count` slots; anything that doesn't fit is joined onto
// the last one (rather than silently dropped).
export function fitLines(lines: string[], count: number, joiner = ", "): string[] {
  if (lines.length <= count) return lines;
  return [...lines.slice(0, count - 1), lines.slice(count - 1).join(joiner)];
}

export function fmtNumber(n: number, decimals: number, grouping = true) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
}

// Excel's weight conversion in the owner's sheets (18,056 KG -> 39,806 LBS).
const KG_TO_LB = 2.2046;
export function weightKgLbs(raw: number | string | null, unit: string | null): { kg: number; lb: number } | null {
  const weight = raw == null || raw === "" ? NaN : Number(raw);
  if (!isFinite(weight)) return null;
  const isLb = /^LB/i.test(unit || "");
  return isLb ? { lb: weight, kg: weight / KG_TO_LB } : { kg: weight, lb: weight * KG_TO_LB };
}
