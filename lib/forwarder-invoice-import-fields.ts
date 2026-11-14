// Target fields for importing invoice CHARGE data onto forwarder
// invoices. Mostly fills in already-existing pending invoices (those
// are auto-created from Booking & Instructions - see migration 0015),
// but if a row's Booking Number doesn't exist anywhere yet, the commit
// route creates that booking (with this forwarder assigned) using
// whatever of the BOOKING_CREATE_KEYS fields below are mapped. For a row
// that matches an EXISTING booking those fields only fill what's still
// blank in Booking & Instructions (lib/import-booking-fields.ts). Any custom columns
// (migration 0016) are appended to this list at runtime by the
// parse/commit routes and the client, since those vary per company.
export const FORWARDER_INVOICE_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "booking_number", label: "Booking Number", required: true },
  { key: "container_number", label: "Container Number" },
  // Unlike pol/pod/carrier/erd below, this writes directly onto the
  // invoice (forwarder_invoices.consignee_name) on every mapped row, new
  // booking or not - it was already a plain display column on the ledger
  // with no way to set it from a sheet.
  { key: "consignee_name", label: "Consignee" },
  { key: "pol", label: "POL (fills a blank in Booking & Instructions)" },
  { key: "pod", label: "Port of Discharge (fills a blank in Booking & Instructions)" },
  { key: "final_destination", label: "Port of Delivery (fills a blank in Booking & Instructions)" },
  { key: "carrier", label: "Shipping Line (fills a blank in Booking & Instructions)" },
  // A booking created here with no ERD is invisible on Booking &
  // Instructions forever - that page filters out anything with no
  // Month of Loading/ERD under every year, with no other way to set one
  // short of opening the booking there and editing it by hand. Mapping
  // this lets the sheet's own date (if it has one) carry straight over.
  { key: "erd", label: "Month of Loading / ERD (fills a blank in Booking & Instructions)" },
  // eta and release_status live on the `tracking` row this invoice points
  // at (read live into the ledger's ETA / Status columns), not on
  // forwarder_invoices itself - the commit route writes these onto that
  // tracking row via the invoice's tracking_id instead of as plain
  // invoice columns. A row whose invoice has no tracking link yet (a
  // shell with no container, or a second invoice for one container) can't
  // carry them and is left as-is.
  { key: "eta", label: "ETA (live)" },
  { key: "release_status", label: "Status (live)" },
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "invoice_due_date", label: "Due Date" },
  { key: "freight_charges", label: "Freight Charges" },
  { key: "bl_fees", label: "BL Fees" },
  { key: "aes_fees", label: "AES Fees" },
  { key: "extra_charges", label: "Extra Charges" },
  { key: "correction_charges", label: "Correction Charges" },
  { key: "demurrage", label: "Demurrage" },
  { key: "currency", label: "Currency" },
  { key: "paid_status", label: "Paid / Not Paid" }
];

// Booking columns, not invoice columns: a new booking takes them from the
// sheet; an existing one only where Booking & Instructions is blank.
export const FORWARDER_INVOICE_BOOKING_CREATE_KEYS = new Set(["pol", "pod", "final_destination", "carrier", "erd"]);

// These don't live on forwarder_invoices at all - they're written onto
// the `tracking` row the invoice links to (eta, release_status). The
// commit route pulls them out of the normal invoice-column update loop
// and applies them via the invoice's tracking_id.
export const FORWARDER_INVOICE_TRACKING_KEYS = new Set(["eta", "release_status"]);

export const FORWARDER_INVOICE_DATE_KEYS = new Set(["invoice_date", "invoice_due_date"]);
export const FORWARDER_INVOICE_NUMERIC_KEYS = new Set([
  "freight_charges", "bl_fees", "aes_fees", "extra_charges", "correction_charges", "demurrage"
]);
