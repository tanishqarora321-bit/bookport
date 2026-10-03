// Freight paperwork here is Indian-style DD-MM-YYYY ("27-01-2026" means
// 27 January), which `new Date(...)` doesn't understand on its own:
// "27-01-2026" is Invalid Date (there's no 27th month), and anything
// with a day of 12 or under silently parses as the WRONG date via
// native MM-DD-YYYY guessing ("02-07-2026" read as 7 February instead
// of 2 July) - worse than failing outright, since nothing looks wrong.
// Checked explicitly before falling back to native parsing for
// anything else (ISO strings from cellToValue, "Jan 27 2026", etc).
export function parseDateish(v: string): Date | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
