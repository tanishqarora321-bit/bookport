// Tiny formula engine for the Offer Sheet module.
//
// Every offer_sheet_type defines its own column list (see migration 0010's
// seed data for the 3 real examples: Mixed Rags, Bed Sheet Offer, Wiper
// Costing). Only "computed" columns use this file -- text/number/date
// columns are just whatever the person typed, stored as-is.
//
// A computed column is one function call: add/subtract/multiply/divide
// over a list of args, where each arg is one of:
//   - a numeric literal, e.g. "2.20462" (the lbs->kg conversion, reused
//     verbatim from every sample sheet)
//   - a plain column key -> that ROW's own value for that key (including
//     another computed column's key, if it appears earlier in the array --
//     see "_freight_related" -> "fre_cost" -> "total_cost" chain in Mixed
//     Rags for why column ORDER in the config matters)
//   - "group:<key>" -> the SUM of that key across every row sharing this
//     row's group_key (Bed Sheet/Wiper: freight and trucking are entered
//     once per shipment but need dividing across every item in it)
//   - "sheet:<key>" -> a constant from the offer_sheet's own `settings`
//     jsonb (Mixed Rags' USD->INR rate, so it's one number per sheet
//     instead of retyped on every row)
//
// Deliberately NOT stored in the database -- see migration 0010's header
// comment. This runs fresh every time a sheet is read (page load or API
// response), so there is nothing to go stale when a raw input changes.

export type ColumnDef = {
  key: string;
  label: string;
  kind: "text" | "number" | "date" | "computed";
  scope?: "row" | "group";
  hidden?: boolean;
  decimals?: number;
  prefix?: string;
  compute?: {
    fn: "add" | "subtract" | "multiply" | "divide";
    args: string[];
  };
};

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveArg(
  arg: string,
  row: Record<string, any>,
  groupRows: Record<string, any>[],
  sheetSettings: Record<string, any>,
  computedSoFar: Record<string, number>
): number {
  if (/^-?\d+(\.\d+)?$/.test(arg)) return Number(arg);

  if (arg.startsWith("group:")) {
    const key = arg.slice("group:".length);
    // Sum across every row in the group -- works whether the value is
    // entered once (blank on the other rows) or repeated on every row.
    return groupRows.reduce((sum, r) => sum + num(r[key]), 0);
  }

  if (arg.startsWith("sheet:")) {
    const key = arg.slice("sheet:".length);
    return num(sheetSettings[key]);
  }

  if (Object.prototype.hasOwnProperty.call(computedSoFar, arg)) {
    return computedSoFar[arg];
  }

  return num(row[arg]);
}

function applyFn(fn: "add" | "subtract" | "multiply" | "divide", values: number[]): number {
  if (fn === "add") return values.reduce((s, v) => s + v, 0);
  if (fn === "subtract") return values.reduce((s, v, i) => (i === 0 ? v : s - v), 0);
  if (fn === "multiply") return values.reduce((s, v) => s * v, 1);
  // divide: first two args only, by design (every real formula here is a/b)
  const [a, b] = values;
  return b === 0 ? 0 : a / b;
}

/**
 * Computes every "computed" column for one row, given the raw inputs of
 * every row sharing its group_key (pass [row] itself if ungrouped).
 * Returns the row's raw inputs merged with the computed values.
 */
export function computeRow(
  columns: ColumnDef[],
  row: Record<string, any>,
  groupRows: Record<string, any>[],
  sheetSettings: Record<string, any> = {}
): Record<string, any> {
  const result: Record<string, any> = { ...row };
  const computedSoFar: Record<string, number> = {};

  for (const col of columns) {
    if (col.kind !== "computed" || !col.compute) continue;
    const values = col.compute.args.map((a) => resolveArg(a, row, groupRows, sheetSettings, computedSoFar));
    const value = applyFn(col.compute.fn, values);
    const rounded = Math.round(value * 1e6) / 1e6; // kill float noise, keep plenty of precision
    computedSoFar[col.key] = rounded;
    result[col.key] = rounded;
  }

  return result;
}

/** Computes every row in a sheet, grouping by group_key where present. */
export function computeAllRows(
  columns: ColumnDef[],
  rows: { id: string; group_key: string | null; row_data: Record<string, any> }[],
  sheetSettings: Record<string, any> = {}
) {
  const byGroup = new Map<string, Record<string, any>[]>();
  for (const r of rows) {
    const key = r.group_key ?? `__row_${r.id}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(r.row_data);
  }

  return rows.map((r) => {
    const key = r.group_key ?? `__row_${r.id}`;
    const groupRows = byGroup.get(key)!;
    return {
      id: r.id,
      group_key: r.group_key,
      ...computeRow(columns, r.row_data, groupRows, sheetSettings),
    };
  });
}

/** Numeric-only sum of a column across a set of already-computed rows -- for group/grand-total footers in the UI. */
export function sumColumn(rows: Record<string, any>[], key: string): number {
  return rows.reduce((sum, r) => sum + num(r[key]), 0);
}

export function formatValue(col: ColumnDef, value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (col.kind === "date") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (col.kind === "number" || col.kind === "computed") {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const decimals = col.decimals ?? 2;
    const formatted = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return col.prefix ? `${col.prefix}${formatted}` : formatted;
  }
  return String(value);
}
