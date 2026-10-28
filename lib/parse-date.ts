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

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// A real statement's "Month of Loading" column is often just the bare
// month name ("JANUARY") with no year of its own - parseDateish() can't
// turn that into a real date (new Date("JANUARY") is Invalid Date), so it
// silently never got set on the booking it was mapped to, even though the
// column WAS correctly mapped (found live: a forwarder statement with
// "MONTH OF LOADING" matched to ERD, every resulting booking still had a
// null ERD, which makes it invisible on Booking & Instructions forever).
// `referenceDate` - typically this row's own Invoice Date, which DOES
// carry a real year - fills in what the sheet left out.
export function parseMonthish(v: string, referenceDate: Date | null): Date | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s || !referenceDate) return null;
  const monthIndex = MONTH_NAMES.indexOf(s);
  if (monthIndex === -1) return null;
  return new Date(Date.UTC(referenceDate.getUTCFullYear(), monthIndex, 1));
}
