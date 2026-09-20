import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { suggestMapping } from "@/lib/gemini";
import { PARTY_IMPORT_FIELDS } from "@/lib/party-import-fields";

export const maxDuration = 60;

// Same parsing approach as app/api/bookings/import/parse/route.ts -
// see that file's comments for why exceljs (not xlsx/SheetJS) and why
// the MAX_ROWS cap.
const MAX_ROWS = 2000;

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
    return NextResponse.json(
      { error: `Couldn't read this as an Excel file (.xlsx): ${err.message}` },
      { status: 400 }
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ error: "That spreadsheet has no sheets." }, { status: 400 });

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToValue(cell).trim();
  });
  while (headers.length && !headers[headers.length - 1]) headers.pop();

  if (headers.length === 0) {
    return NextResponse.json({ error: "No header row found in the first sheet." }, { status: 400 });
  }

  const rows: string[][] = [];
  for (let r = 2; r <= sheet.rowCount && rows.length < MAX_ROWS; r++) {
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

  let suggestedMapping: Record<string, string | null> = {};
  try {
    suggestedMapping = await suggestMapping(headers, PARTY_IMPORT_FIELDS, "forwarder/trucker/supplier/buyer company");
  } catch {
    // A mapping suggestion is a convenience, not a requirement.
  }

  return NextResponse.json({ headers, rows, suggestedMapping });
}
