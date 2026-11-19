import { addDaysIso } from "@/lib/pdf/pdfHelpers";

// The date printed on the Fumigation Certificate, Certificate of Origin and
// Set of Documents (owner, 2026-11-19): 3 days BEFORE the BL date by
// default (BL 24 Aug -> 21 Aug); on print the Buyers ledger asks whether to
// keep that or use another date, and sends the chosen one as body.date.
// Without a BL date the user must enter one.
export const DOC_DATE_OFFSET_DAYS = -3;

export function defaultDocDate(blDate: string | null | undefined): string | null {
  return blDate ? addDaysIso(String(blDate).slice(0, 10), DOC_DATE_OFFSET_DAYS) : null;
}

export async function resolveDocDate(req: Request, blDate: string | null | undefined): Promise<{ date: string } | { error: string }> {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const given = typeof body?.date === "string" ? body.date.trim().slice(0, 10) : "";
  if (given) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(given) || isNaN(new Date(`${given}T00:00:00Z`).getTime())) return { error: "That date isn't valid." };
    return { date: given };
  }
  const d = defaultDocDate(blDate);
  if (!d) return { error: "This booking has no BL date yet - enter the date to print, or upload the BL on Booking & Instructions first." };
  return { date: d };
}
