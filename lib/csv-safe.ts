// One CSV cell, quoted, and safe to open in Excel (security audit 2026-11).
// A cell starting with = + - @ (or a tab / carriage return) is run as a
// FORMULA by Excel/Sheets - a party name typed as `=HYPERLINK(...)` could
// then leak data or trick a click when someone opens the export
// ("CSV injection"). Such text gets a leading apostrophe so it shows as
// plain text; real numbers (including negatives like -125.50) are left alone.
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
