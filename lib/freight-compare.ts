import { addOnFor, lineKey, originKey, originLabel } from "./freight-normalize";

// The Freight Comparison grid (owner, 2026-11), built the way the owner's own
// "Freight Comparison - Mundra" sheet is:
//   rows    = origins (written differently by each forwarder, merged);
//   columns = "Forwarder - Line", in upload order, lines in sheet order;
//   cells   = the forwarder's rate + its per-container add-on (UAL +$65,
//             ONE +$75, Walker +$35...), the rate as read kept alongside;
//   lowest  = the cheapest cell(s) per origin (green);
//   best    = the cheapest cell with at least `minFreeDays` destination free
//             days (blue) - "cheap AND more free time", when it isn't
//             already the lowest.
export type CompareSheet = {
  id: string;
  forwarder_name: string;
  add_on?: number | null;
  add_on_by_line?: Record<string, number> | null;
  entries: { origin: string; shipping_line: string; rate: number | null; free_days: number | null; sort_order?: number }[];
};

export type CompareColumn = { key: string; forwarder: string; line: string; freeDays: number | null; addOn: number; sheetId: string };
export type CompareCell = { rate: number; base: number; addOn: number; freeDays: number | null };
export type CompareRow = {
  key: string;
  label: string;
  cells: Record<string, CompareCell>;
  lowest: number | null;
  lowestCols: string[];
  best: { col: string; rate: number } | null; // only when different from the lowest
};

function mostCommon(values: (number | null)[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n || (c === n && best !== null && v > best)) [best, n] = [v, c];
  return best;
}

export function buildComparison(sheets: CompareSheet[], minFreeDays: number) {
  const columns: CompareColumn[] = [];
  const colByKey = new Map<string, CompareColumn>();
  const freeByCol = new Map<string, (number | null)[]>();
  const rowsByKey = new Map<string, CompareRow>();
  const rowOrder: string[] = [];

  for (const sheet of sheets) {
    const entries = [...sheet.entries].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    // Lines in the order of the forwarder's own table header: within each
    // origin row the carriers come left to right, so count how often line A
    // comes before line B across the rows and order by that (a line missing
    // from the first row - UAL's Evergreen on Atlanta - still lands in place).
    const before = new Map<string, Map<string, number>>();
    const seen: string[] = [];
    let rowLines: string[] = [];
    let rowOrigin: string | null = null;
    const flush = () => {
      for (let a = 0; a < rowLines.length; a++)
        for (let b = a + 1; b < rowLines.length; b++) {
          const m = before.get(rowLines[a]) ?? new Map<string, number>();
          m.set(rowLines[b], (m.get(rowLines[b]) ?? 0) + 1);
          before.set(rowLines[a], m);
        }
      rowLines = [];
    };
    for (const e of entries) {
      const l = lineKey(e.shipping_line);
      if (!seen.includes(l)) seen.push(l);
      if (e.origin !== rowOrigin) {
        flush();
        rowOrigin = e.origin;
      }
      if (!rowLines.includes(l)) rowLines.push(l);
    }
    flush();
    const cmp = (a: string, b: string) => (before.get(b)?.get(a) ?? 0) - (before.get(a)?.get(b) ?? 0);
    const lineOrder = [...seen].sort((a, b) => cmp(a, b) || seen.indexOf(a) - seen.indexOf(b));
    for (const l of lineOrder) {
      const colKey = `${sheet.id}||${l}`;
      if (!colByKey.has(colKey) && entries.some((e) => lineKey(e.shipping_line) === l && Number(e.rate) > 0)) {
        const col: CompareColumn = { key: colKey, forwarder: sheet.forwarder_name, line: l, freeDays: null, addOn: addOnFor(sheet, l), sheetId: sheet.id };
        colByKey.set(colKey, col);
        columns.push(col);
        freeByCol.set(colKey, []);
      }
    }
    for (const e of entries) {
      // A blank, "-" or 0 isn't a rate (Walker's sheet shows "0" for a line it doesn't serve).
      if (e.rate === null || e.rate === undefined || !Number.isFinite(Number(e.rate)) || Number(e.rate) <= 0) continue;
      const line = lineKey(e.shipping_line);
      const colKey = `${sheet.id}||${line}`;
      if (!colByKey.has(colKey)) {
        const col: CompareColumn = { key: colKey, forwarder: sheet.forwarder_name, line, freeDays: null, addOn: addOnFor(sheet, line), sheetId: sheet.id };
        colByKey.set(colKey, col);
        columns.push(col);
        freeByCol.set(colKey, []);
      }
      freeByCol.get(colKey)!.push(e.free_days ?? null);

      const oKey = originKey(e.origin);
      if (!oKey) continue;
      if (!rowsByKey.has(oKey)) {
        rowsByKey.set(oKey, { key: oKey, label: originLabel(oKey), cells: {}, lowest: null, lowestCols: [], best: null });
        rowOrder.push(oKey);
      }
      const addOn = addOnFor(sheet, line);
      const cell: CompareCell = { rate: Number(e.rate) + addOn, base: Number(e.rate), addOn, freeDays: e.free_days ?? null };
      const row = rowsByKey.get(oKey)!;
      const prev = row.cells[colKey];
      if (!prev || cell.rate < prev.rate) row.cells[colKey] = cell;
    }
  }
  for (const col of columns) col.freeDays = mostCommon(freeByCol.get(col.key) ?? []);

  const rows = rowOrder.map((k) => rowsByKey.get(k)!).sort((a, b) => a.label.localeCompare(b.label));
  for (const row of rows) {
    const entries = Object.entries(row.cells);
    if (entries.length === 0) continue;
    const min = Math.min(...entries.map(([, c]) => c.rate));
    row.lowest = min;
    row.lowestCols = entries.filter(([, c]) => c.rate === min).map(([k]) => k);
    const freeOf = (k: string, c: CompareCell) => c.freeDays ?? colByKey.get(k)?.freeDays ?? null;
    const qualifying = entries.filter(([k, c]) => (freeOf(k, c) ?? -1) >= minFreeDays);
    if (qualifying.length) {
      const [bk, bc] = qualifying.reduce((a, b) => (b[1].rate < a[1].rate ? b : a));
      if (!row.lowestCols.includes(bk)) row.best = { col: bk, rate: bc.rate };
    }
  }
  return { columns, rows, colByKey };
}

export const colLabel = (c: CompareColumn) => `${c.forwarder} - ${c.line}`;
