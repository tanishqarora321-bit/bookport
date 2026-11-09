// The sidebar's Working Year applies to every module except Workspace. Each
// record's year comes from its own data, never a separately stored field.

// An invoice belongs to the year of its Month of Loading, else its Invoice
// Date. One with neither yet (a pending invoice just created from Booking &
// Instructions, say) shows under EVERY year rather than vanishing - it's
// still work to do, and hiding it would make it unreachable.
export function invoiceInWorkingYear(
  inv: { month_of_loading?: string | null; invoice_date?: string | null },
  year: number
): boolean {
  const d = inv.month_of_loading || inv.invoice_date;
  if (!d) return true;
  return Number(String(d).slice(0, 4)) === year;
}

// For anything dated by a single value (an ETA, a period like "2026-03", a
// created_at timestamp): its year, or true when undated - same reasoning.
export function dateInWorkingYear(d: string | null | undefined, year: number): boolean {
  if (!d) return true;
  return Number(String(d).slice(0, 4)) === year;
}
