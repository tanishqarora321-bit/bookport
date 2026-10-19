import { PDFPage, PDFFont, rgb } from "pdf-lib";

// Shared by every lib/pdf/generate*.ts file - the same tiny utilities
// generateFinalInvoice.ts already had inline, pulled out once more
// generators need them rather than re-pasting a third/fourth copy.

export function hexToRgb(hex?: string) {
  if (!hex) return rgb(0.06, 0.09, 0.16);
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

export function formatDateDMY(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// "10 SEPTEMBER 2026" - the style Fumigation Certificate/Certificate of
// Origin use, as shown on the real documents.
export function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }).toUpperCase();
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

// "22-Aug-26" - the style the real Certificate of Origin sample uses for
// its own DATE: field.
export function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

// Per Tanishq's spec: Fumigation/COO/Commercial Invoice dates are all "3
// days after BL issued date" - one place to get that math right.
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function makeDrawer(page: PDFPage, defaultFont: PDFFont) {
  return (text: string, x: number, y: number, opts: { font?: PDFFont; size?: number; color?: any } = {}) => {
    page.drawText(text ?? "", {
      x,
      y,
      size: opts.size ?? 9,
      font: opts.font ?? defaultFont,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });
  };
}
