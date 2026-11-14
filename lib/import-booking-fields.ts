// Booking-level values an invoice sheet can carry (owner rule, 2026-11 -
// the same in all four party imports: Forwarders, Truckers, Suppliers,
// Buyers):
//   - a booking the import CREATES takes them from the sheet;
//   - a booking that already exists (matched by Booking + Container) only
//     takes a value where Booking & Instructions is still BLANK - whatever
//     is already set there always wins;
//   - after the import, these are changed only in Booking & Instructions.
// Month of Loading is the booking's ERD (it decides where the booking is
// filed on Booking & Instructions).
export const IMPORT_BOOKING_FIELD_KEYS = ["erd", "carrier", "pol", "pod", "final_destination"] as const;
export type ImportBookingKey = (typeof IMPORT_BOOKING_FIELD_KEYS)[number];

// The import-field entries for them (Month of Loading is listed by each
// import itself, since some already had it in their own place).
export const IMPORT_BOOKING_FIELDS: { key: ImportBookingKey; label: string }[] = [
  { key: "carrier", label: "Shipping Line (fills a blank in Booking & Instructions)" },
  { key: "pol", label: "POL (fills a blank in Booking & Instructions)" },
  { key: "pod", label: "Port of Discharge (fills a blank in Booking & Instructions)" },
  { key: "final_destination", label: "Port of Delivery (fills a blank in Booking & Instructions)" },
];
export const IMPORT_BOOKING_ERD_LABEL = "Month of Loading / ERD (fills a blank in Booking & Instructions)";

function blank(v: unknown) {
  return v === null || v === undefined || String(v).trim() === "";
}

// Fills the booking's blank fields from the sheet's values; never overwrites
// one that's already set. A Shipping Line / POL / POD it fills is also
// copied onto this booking's forwarder invoices where theirs is blank (they
// keep a copy of those for the ledger, like a Booking & Instructions edit
// does). Returns the fields it filled.
export async function fillBookingBlanks(
  supabase: any,
  bookingId: string,
  values: Partial<Record<ImportBookingKey, string | null | undefined>>
): Promise<Record<string, string>> {
  const wanted = IMPORT_BOOKING_FIELD_KEYS.filter((k) => !blank(values[k]));
  if (wanted.length === 0) return {};
  const { data: booking } = await supabase.from("bookings").select(wanted.join(", ")).eq("id", bookingId).maybeSingle();
  if (!booking) return {};

  const fill: Record<string, string> = {};
  for (const k of wanted) {
    if (blank((booking as any)[k])) fill[k] = String(values[k]).trim();
  }
  if (Object.keys(fill).length === 0) return {};
  const { error } = await supabase.from("bookings").update(fill).eq("id", bookingId);
  if (error) return {};

  const invoiceCopy: Record<string, string> = {};
  if (fill.carrier) invoiceCopy.shipping_line = fill.carrier;
  if (fill.pol) invoiceCopy.pol = fill.pol;
  if (fill.pod) invoiceCopy.pod = fill.pod;
  if (Object.keys(invoiceCopy).length > 0) {
    const { data: trk } = await supabase.from("tracking").select("id").eq("booking_id", bookingId);
    const trackingIds = (trk ?? []).map((t: { id: string }) => t.id);
    if (trackingIds.length > 0) {
      for (const [col, val] of Object.entries(invoiceCopy)) {
        await supabase.from("forwarder_invoices").update({ [col]: val }).in("tracking_id", trackingIds).is(col, null);
      }
    }
  }
  return fill;
}
