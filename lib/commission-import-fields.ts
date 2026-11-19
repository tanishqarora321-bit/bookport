// Import Excel on Commission Bookings (owner, 2026-11-19): one sheet row =
// one commission booking. Month of Loading may be a date, "Nov 2026", or a
// bare month name ("NOVEMBER", the year then comes from the import dialog's
// default month); without the column, every row takes that default month.
export const COMMISSION_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "booking_number", label: "Booking Number" },
  { key: "container_number", label: "Container Number" },
  { key: "commission_party", label: "Commission Party" },
  { key: "commission_amount", label: "Commission Amount", required: true },
  { key: "month_of_loading", label: "Month of Loading" },
];
