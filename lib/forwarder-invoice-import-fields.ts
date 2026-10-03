// Target fields for importing invoice CHARGE data onto forwarder
// invoices. Mostly fills in already-existing pending invoices (those
// are auto-created from Booking & Instructions - see migration 0015),
// but if a row's Booking Number doesn't exist anywhere yet, the commit
// route creates that booking (with this forwarder assigned) using
// whatever of the BOOKING_CREATE_KEYS fields below are mapped - those
// fields are ignored for a row that matches an EXISTING booking, since
// that booking already has its own data. Any custom columns
// (migration 0016) are appended to this list at runtime by the
// parse/commit routes and the client, since those vary per company.
export const FORWARDER_INVOICE_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "booking_number", label: "Booking Number", required: true },
  { key: "container_number", label: "Container Number" },
  { key: "pol", label: "POL (new bookings only)" },
  { key: "pod", label: "Port of Discharge (new bookings only)" },
  { key: "final_destination", label: "Port of Delivery (new bookings only)" },
  { key: "carrier", label: "Shipping Line (new bookings only)" },
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "invoice_due_date", label: "Due Date" },
  { key: "freight_charges", label: "Freight Charges" },
  { key: "bl_fees", label: "BL Fees" },
  { key: "aes_fees", label: "AES Fees" },
  { key: "extra_charges", label: "Extra Charges" },
  { key: "correction_charges", label: "Correction Charges" },
  { key: "demurrage", label: "Demurrage" },
  { key: "currency", label: "Currency" }
];

// Only meaningful when this row's Booking Number requires creating a
// brand-new booking - these become that booking's own columns.
export const FORWARDER_INVOICE_BOOKING_CREATE_KEYS = new Set(["pol", "pod", "final_destination", "carrier"]);

export const FORWARDER_INVOICE_DATE_KEYS = new Set(["invoice_date", "invoice_due_date"]);
export const FORWARDER_INVOICE_NUMERIC_KEYS = new Set([
  "freight_charges", "bl_fees", "aes_fees", "extra_charges", "correction_charges", "demurrage"
]);
