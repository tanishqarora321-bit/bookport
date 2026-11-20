import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentProfile } from "@/lib/supabase/session";
import { extractRateSheetFromPdf, extractRateSheetFromTable } from "@/lib/rate-sheet-gemini";

export const maxDuration = 60;

// Reads one uploaded rate sheet - PDF, Excel (.xlsx) or CSV - and returns
// what it found (forwarder, rates, free days, charges) for the review step
// in Freight Comparison's upload panel. Nothing is saved here.
function cellText(cell: ExcelJS.Cell): string {
  const v: any = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return v.result == null || typeof v.result === "object" ? "" : String(v.result);
    if ("richText" in v) return (v.richText ?? []).map((t: any) => t.text).join("");
    if ("text" in v) return String(v.text ?? "");
    return "";
  }
  return String(v).replace(/[\t\r\n]+/g, " ");
}

export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  const name = file.name || "rate sheet";
  const lower = name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      return NextResponse.json({ file: name, ...(await extractRateSheetFromPdf(buffer.toString("base64"))) });
    }
    if (lower.endsWith(".xls")) {
      return NextResponse.json({ error: `"${name}" is an old .xls file - open it in Excel and "Save As" .xlsx, then upload that.` }, { status: 400 });
    }
    let table = "";
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
      const wb = new ExcelJS.Workbook();
      // @ts-expect-error - exceljs's bundled Buffer type predates @types/node's generic Buffer
      await wb.xlsx.load(buffer);
      for (const ws of wb.worksheets) {
        const rows: string[] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          if (rows.length >= 500) return;
          const cells: string[] = [];
          for (let c = 1; c <= Math.min(row.cellCount, 40); c++) {
            const cell = row.getCell(c);
            // A merged block (e.g. a title across the row) is written once.
            cells.push(cell.isMerged && cell.master.address !== cell.address ? "" : cellText(cell).trim());
          }
          if (cells.some(Boolean)) rows.push(cells.join("\t"));
        });
        if (rows.length) table += `### Sheet: ${ws.name}\n${rows.join("\n")}\n\n`;
      }
    } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      table = buffer.toString("utf8").split(/\r?\n/).slice(0, 600).map((l) => l.replace(/,/g, "\t")).join("\n");
    } else {
      return NextResponse.json({ error: `"${name}" isn't a PDF, Excel (.xlsx) or CSV file.` }, { status: 400 });
    }
    if (!table.trim()) return NextResponse.json({ error: `"${name}" looks empty.` }, { status: 400 });
    return NextResponse.json({ file: name, ...(await extractRateSheetFromTable(table.slice(0, 120000), name)) });
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't read "${name}": ${err?.message ?? "unknown error"}` }, { status: 502 });
  }
}
