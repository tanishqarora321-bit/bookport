import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { suggestMapping } from "@/lib/gemini";
import { createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY_ID } from "@/lib/constants";
import { TRUCKER_INVOICE_IMPORT_FIELDS } from "@/lib/trucker-invoice-import-fields";

export const maxDuration = 60;

const MAX_ROWS = 2000;
const MAX_HEADER_SCAN_ROWS = 10;

function cellToValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const anyV = v as any;
    if ("result" in anyV) return anyV.result === null || anyV.result === undefined ? "" : String(anyV.result);
    if ("richText" in anyV) return (anyV.richText ?? []).map((t: any) => t.text).join("");
    if ("text" in anyV) return String(anyV.text ?? "");
    return "";
  }
  return String(v);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    // @ts-expect-error - exceljs's bundled types predate @types/node's
    // generic Buffer<T>, which trips a structural mismatch here even
    // though this is exactly the Buffer type its runtime code expects.
    await workbook.xlsx.load(buffer);
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't read this as an Excel file (.xlsx): ${err.message}` }, { status: 400 });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ error: "That spreadsheet has no sheets." }, { status: 400 });

  // A real trucking statement often has a title banner ("C&K Trucking
  // Account Statement -2026") before the real column headers - scanning
  // for the first row with several distinct non-empty cells (a banner
  // has exactly one) finds the real header row instead of always
  // assuming row 1.
  let headerRowNumber = 1;
  let headers: string[] = [];
  for (let r = 1; r <= Math.min(MAX_HEADER_SCAN_ROWS, sheet.rowCount); r++) {
    const candidate: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      candidate[colNumber - 1] = cellToValue(cell).trim();
    });
    while (candidate.length && !candidate[candidate.length - 1]) candidate.pop();
    const nonEmptyCount = candidate.filter(Boolean).length;
    if (nonEmptyCount >= 3) {
      headerRowNumber = r;
      headers = candidate;
      break;
    }
  }

  if (headers.length === 0) {
    return NextResponse.json({ error: "Couldn't find a header row (looked in the first 10 rows for one with at least 3 columns)." }, { status: 400 });
  }

  const rows: string[][] = [];
  for (let r = headerRowNumber + 1; r <= sheet.rowCount && rows.length < MAX_ROWS; r++) {
    const row = sheet.getRow(r);
    const values: string[] = [];
    let hasData = false;
    for (let c = 1; c <= headers.length; c++) {
      const val = cellToValue(row.getCell(c));
      if (val) hasData = true;
      values.push(val);
    }
    if (hasData) rows.push(values);
  }

  const supabase = createServiceClient();
  const { data: customColumns } = await supabase
    .from("trucker_invoice_custom_columns")
    .select("key, label")
    .eq("company_id", DEFAULT_COMPANY_ID);

  const fields = [...TRUCKER_INVOICE_IMPORT_FIELDS, ...(customColumns ?? [])];

  let suggestedMapping: Record<string, string | null> = {};
  try {
    suggestedMapping = await suggestMapping(headers, fields, "trucker invoice charges");
  } catch {
    // A mapping suggestion is a convenience, not a requirement.
  }

  return NextResponse.json({ headers, rows, suggestedMapping, customColumns: customColumns ?? [] });
}
