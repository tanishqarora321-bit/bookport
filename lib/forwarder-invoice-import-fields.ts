// Fixed target fields for importing invoice CHARGE data onto already-
// existing forwarder_invoices rows (those are auto-created from Booking
// & Instructions - see supabase/migrations/0015 - this import never
// creates a booking or a new invoice shell, only fills one in). Any
// custom columns (supabase/migrations/0016) are appended to this list
// at runtime by the parse/commit routes and the client, since those
// vary per company.
export const FORWARDER_INVOICE_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "booking_number", label: "Booking Number", required: true },
  { key: "container_number", label: "Container Number" },
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

export const FORWARDER_INVOICE_DATE_KEYS = new Set(["invoice_date", "invoice_due_date"]);
export const FORWARDER_INVOICE_NUMERIC_KEYS = new Set([
  "freight_charges", "bl_fees", "aes_fees", "extra_charges", "correction_charges", "demurrage"
]);
