// Matching rules for the Freight Comparison (owner, 2026-11): forwarders
// write the same origin / carrier in different ways - these make them one
// row / one column.

// "ATLANTA (RAMP)", "Atlanta RAMP", "Chicago, IL Ramp", "Kansas City KS/MO
// Ramp", "Los Angeles/Long Beach, CA", "MIAMI (PORT/RAMP)", "St. Louis"
// -> ATLANTA, CHICAGO, KANSAS CITY, LOS ANGELES, MIAMI, SAINT LOUIS.
export function originKey(raw: string): string {
  let s = (raw || "").toUpperCase().replace(/\s+/g, " ").trim();
  s = s.replace(/\(.*?\)/g, " "); // (RAMP), (PORT/RAMP)
  s = s.split("/")[0]; // LOS ANGELES/LONG BEACH -> LOS ANGELES; EL-PASO / SANTA TERESA -> EL-PASO
  s = s.split(",")[0]; // CHICAGO, IL RAMP -> CHICAGO
  s = s.replace(/\b(RAMP|PORT|CY|RAIL)\b/g, " ");
  s = s.replace(/^ST\.?\s+/, "SAINT ").replace(/\bST\.?\s+(LOUIS|PAUL)\b/, "SAINT $1");
  s = s.replace(/\s+[A-Z]{2}$/, ""); // KANSAS CITY KS -> KANSAS CITY (2-letter state at the end)
  s = s.replace(/[^A-Z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
  return s.replace(/ - /g, "-");
}

// Title-case label for a row: "KANSAS CITY" -> "Kansas City".
export function originLabel(key: string): string {
  return key.toLowerCase().replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
}

const LINE_ALIASES: [RegExp, string][] = [
  [/^(HAPAG|HLAG|HAPAG[\s-]*LL?OYD|HAPAG LLYOD)$/, "HAPAG-LLOYD"],
  [/^(ONE|ONE LINE|OCEAN NETWORK EXPRESS)$/, "ONE"],
  [/^(CMA|CMA CGM|CMA-CGM)$/, "CMA CGM"],
  [/^(EMC|EVERGREEN|EVERGREEN LINE)$/, "EVERGREEN"],
  [/^(MAERSK|MAERSK LINE|MSK)$/, "MAERSK"],
  [/^(MSC|MEDITERRANEAN SHIPPING)$/, "MSC"],
  [/^(COSCO|COSCO SHIPPING)$/, "COSCO"],
  [/^(OOCL)$/, "OOCL"],
  [/^(WAN HAI|WANHAI|WHL)$/, "WAN HAI"],
];
export function lineKey(raw: string): string {
  const s = (raw || "").toUpperCase().replace(/\s+/g, " ").trim();
  for (const [re, name] of LINE_ALIASES) if (re.test(s)) return name;
  return s;
}

// Amount added to a rate of this sheet for this carrier.
export function addOnFor(sheet: { add_on?: number | null; add_on_by_line?: Record<string, number> | null }, line: string): number {
  const byLine = sheet.add_on_by_line ?? {};
  const k = lineKey(line);
  for (const [l, v] of Object.entries(byLine)) if (lineKey(l) === k && Number.isFinite(Number(v))) return Number(v);
  return Number(sheet.add_on) || 0;
}
