import ExcelJS from "exceljs";
import { buildComparison, colLabel } from "@/lib/freight-compare";

// Builds the Freight Comparison workbook (see app/api/rate-sheets/export).
const HEADER = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } } as const;
const GREEN = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } } as const;
const BLUE = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } } as const;
const AMBER = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } } as const;
const thin = { style: "thin", color: { argb: "FFD9D9D9" } } as const;
const box = { top: thin, left: thin, bottom: thin, right: thin };

export function buildFreightWorkbook(sheets: any[], month: string, destination: string, minFree: number) {
  const { columns, rows, colByKey } = buildComparison(sheets as any[], minFree);
  const monthLabel = new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).toUpperCase();
  const port = destination.split(",")[0].toUpperCase();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Ship-Sphere";
  const ws = wb.addWorksheet("Freight Comparison", { views: [{ state: "frozen", xSplit: 1, ySplit: 6 }] });
  const lastCol = columns.length + 4;
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `FREIGHT COMPARISON – ${port} | ${monthLabel} | 40HC`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, lastCol);
  const addOnSummary = (sheets as any[])
    .map((s) => {
      const by = Object.entries(s.add_on_by_line ?? {}).map(([l, v]) => `${l} +$${v}`);
      return `${s.forwarder_name}: +$${Number(s.add_on) || 0}${by.length ? ` (${by.join(", ")})` : ""}`;
    })
    .join(" · ");
  ws.getCell(2, 1).value = `Added per container - ${addOnSummary}. Green = lowest rate; blue = best value (lowest with ${minFree}+ destination free days).`;
  ws.getCell(2, 1).alignment = { wrapText: true };
  ws.getRow(2).height = 30;

  const head = ["Location", ...columns.map(colLabel), "Lowest Rate", "Lowest Forwarder / Line", `Best value (${minFree}+ free days)`];
  ws.getRow(4).values = head;
  ws.getRow(5).values = ["Free days", ...columns.map((c) => c.freeDays ?? "?"), "", "", ""];
  ws.getRow(6).values = ["Added per container", ...columns.map((c) => c.addOn), "", "", ""];
  for (let c = 1; c <= lastCol; c++) {
    const h = ws.getCell(4, c);
    h.fill = HEADER;
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.alignment = { wrapText: true, vertical: "middle", horizontal: c === 1 ? "left" : "center" };
    h.border = box;
    for (const r of [5, 6]) {
      const cell = ws.getCell(r, c);
      cell.font = { italic: true, color: { argb: "FF595959" } };
      cell.alignment = { horizontal: c === 1 ? "left" : "center" };
      cell.border = box;
    }
  }
  columns.forEach((col, i) => {
    if (col.freeDays !== null && col.freeDays < minFree) ws.getCell(5, i + 2).fill = AMBER;
  });
  ws.getRow(4).height = 34;

  rows.forEach((row, ri) => {
    const r = 7 + ri;
    ws.getCell(r, 1).value = row.label.toUpperCase();
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 1).border = box;
    columns.forEach((col, ci) => {
      const cell = ws.getCell(r, ci + 2);
      const v = row.cells[col.key];
      cell.border = box;
      cell.alignment = { horizontal: "center" };
      if (!v) return;
      cell.value = v.rate;
      cell.numFmt = "#,##0";
      if (row.lowestCols.includes(col.key)) {
        cell.fill = GREEN;
        cell.font = { bold: true };
      } else if (row.best?.col === col.key) {
        cell.fill = BLUE;
        cell.font = { bold: true };
      }
    });
    const low = ws.getCell(r, columns.length + 2);
    low.value = row.lowest ?? null;
    low.numFmt = "#,##0";
    low.font = { bold: true };
    ws.getCell(r, columns.length + 3).value = row.lowestCols.map((k) => colLabel(colByKey.get(k)!)).join(", ");
    ws.getCell(r, columns.length + 4).value = row.best ? `${colLabel(colByKey.get(row.best.col)!)} ($${row.best.rate.toLocaleString()})` : row.lowest !== null ? "Same as lowest" : "";
    for (const c of [columns.length + 2, columns.length + 3, columns.length + 4]) ws.getCell(r, c).border = box;
  });
  ws.getColumn(1).width = 26;
  for (let c = 2; c <= columns.length + 1; c++) ws.getColumn(c).width = 15;
  ws.getColumn(columns.length + 2).width = 13;
  ws.getColumn(columns.length + 3).width = 34;
  ws.getColumn(columns.length + 4).width = 36;

  // Notes & Charges
  const notes = wb.addWorksheet("Notes & Charges");
  notes.addRow(["Forwarder", "Added per container", "Different per line", "Charges in the sheet", "Source file"]);
  notes.getRow(1).eachCell((c) => {
    c.fill = HEADER;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  for (const s of sheets as any[]) {
    notes.addRow([
      s.forwarder_name,
      Number(s.add_on) || 0,
      Object.entries(s.add_on_by_line ?? {}).map(([l, v]) => `${l} +$${v}`).join(", "),
      s.charges_note ?? "",
      s.source_file_name ?? s.source_type,
    ]);
  }
  notes.addRow([]);
  notes.addRow(["Comparison", `Green = lowest rate per location (rate + add-on). Blue = best value: lowest rate with at least ${minFree} destination free days, when that isn't already the lowest.`]);
  notes.columns = [{ width: 22 }, { width: 20 }, { width: 28 }, { width: 80 }, { width: 40 }];
  notes.getColumn(4).alignment = { wrapText: true, vertical: "top" };

  // Each forwarder's original rates
  for (const s of sheets as any[]) {
    const name = `${String(s.forwarder_name).replace(/[\\/?*[\]:]/g, " ").slice(0, 22)} Original`;
    const sh = wb.addWorksheet(wb.getWorksheet(name) ? `${name} ${s.id.slice(0, 4)}` : name);
    const lines = Array.from(new Set(((s.entries ?? []) as any[]).sort((a, b) => a.sort_order - b.sort_order).map((e) => e.shipping_line)));
    sh.addRow(["Location", ...lines]);
    sh.getRow(1).eachCell((c) => {
      c.fill = HEADER;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    const byOrigin = new Map<string, Record<string, number>>();
    for (const e of s.entries ?? []) {
      if (e.rate == null) continue;
      byOrigin.set(e.origin, { ...(byOrigin.get(e.origin) ?? {}), [e.shipping_line]: Number(e.rate) });
    }
    for (const [origin, rates] of byOrigin) sh.addRow([origin, ...lines.map((l) => rates[l] ?? null)]);
    sh.getColumn(1).width = 30;
  }

  return { wb, monthLabel, port };
}
