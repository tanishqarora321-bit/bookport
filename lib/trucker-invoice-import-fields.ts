// Target fields for importing invoice CHARGE data onto trucker invoices.
// Mostly fills in already-existing pending invoices (auto-created from
// Booking & Instructions - see migration 0022), but if a row's Booking
// Number doesn't exist anywhere yet, the commit route creates that
// booking (with this trucker assigned) using whatever of the
// BOOKING_CREATE_KEYS fields below are mapped. Any custom columns
// (migration 0022) are appended to this list at runtime by the
// parse/commit routes and the client, since those vary per company.
export const TRUCKER_INVOICE_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "booking_number", label: "Booking Number", required: true },
  { key: "container_number", label: "Container Number" },
  { key: "location", label: "Location (new bookings only)" },
  // A booking created here with no ERD is invisible on Booking &
  // Instructions forever - that page filters out anything with no
  // Month of Loading/ERD under every year, with no other way to set one
  // short of opening the booking there and editing it by hand. Mapping
  // this lets the sheet's own date (if it has one) carry straight over.
  { key: "erd", label: "Month of Loading / ERD (new bookings only)" },
  // eta and release_status live on the `tracking` row this invoice points
  // at (read live into the ledger's ETA / Status columns), not on
  // trucker_invoices - the commit route writes these onto that tracking row
  // via the invoice's tracking_id. Same as the Forwarders import.
  { key: "eta", label: "ETA (live)" },
  { key: "release_status", label: "Status (live)" },
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "invoice_due_date", label: "Due Date" },
  { key: "trucking", label: "Trucking" },
  { key: "fuel_surcharge", label: "Fuel Surcharge" },
  { key: "chassis_rental", label: "Chassis Rental" },
  { key: "stop_off", label: "Stop Off" },
  { key: "chassis_split", label: "Chassis Split" },
  { key: "misc_charges", label: "Other/Misc Charges" },
  { key: "currency", label: "Currency" },
  { key: "paid_status", label: "Paid / Not Paid" }
];

// Only meaningful when this row's Booking Number requires creating a
// brand-new booking - "location" becomes the invoice's own field (not a
// booking column), so it's intentionally excluded here unlike
// forwarder's pol/pod/carrier.
export const TRUCKER_INVOICE_BOOKING_CREATE_KEYS = new Set<string>(["erd"]);

// Written onto the invoice's `tracking` row, not trucker_invoices itself.
export const TRUCKER_INVOICE_TRACKING_KEYS = new Set(["eta", "release_status"]);

export const TRUCKER_INVOICE_DATE_KEYS = new Set(["invoice_date", "invoice_due_date"]);
export const TRUCKER_INVOICE_NUMERIC_KEYS = new Set([
  "trucking", "fuel_surcharge", "chassis_rental", "stop_off", "chassis_split", "misc_charges"
]);
