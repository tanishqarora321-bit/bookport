// Target fields for importing a supplier statement (e.g. RECUTEX). Unlike
// the forwarder invoice import, one invoice here spans SEVERAL rows - a
// row with a Booking Number starts a new invoice, and the Description/
// Weight/Unit Price/Amount rows directly under it (with Booking Number
// left blank) are that invoice's cost-section line items, until the next
// non-blank Booking Number row starts the next invoice. See
// app/api/supplier-invoices/import/commit/route.ts for the grouping logic.
export const SUPPLIER_INVOICE_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "booking_number", label: "Booking Number", required: true },
  { key: "container_number", label: "Container Number" },
  { key: "forwarder_name", label: "Forwarder (FF)" },
  { key: "consignee_name", label: "Consignee" },
  // Becomes the booking's ERD when the import has to create the booking
  // (Booking & Instructions hides any booking without one), and the
  // invoice's own Month of Loading either way. Same as Forwarders/Truckers.
  { key: "erd", label: "Month of Loading / ERD" },
  // eta and release_status live on the `tracking` row this invoice points
  // at (the ledger's ETA / Status (live) columns), not on supplier_invoices -
  // the commit route writes them onto that row. Same as Forwarders/Truckers.
  { key: "eta", label: "ETA (live)" },
  { key: "release_status", label: "Status (live)" },
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "paid_status", label: "Paid / Not Paid" },
  { key: "description", label: "Description" },
  { key: "weight_kg", label: "Weight (KG)" },
  { key: "unit_price", label: "Unit Price" },
  { key: "amount", label: "Amount" },
];

export const SUPPLIER_INVOICE_DATE_KEYS = new Set(["invoice_date"]);
export const SUPPLIER_INVOICE_NUMERIC_KEYS = new Set(["weight_kg", "unit_price", "amount"]);
// These belong to the invoice HEADER (taken once per group, from
// whichever row in the group first has a value), never per cost line.
export const SUPPLIER_INVOICE_HEADER_KEYS = new Set([
  "container_number",
  "forwarder_name",
  "consignee_name",
  "erd",
  "eta",
  "release_status",
  "invoice_number",
  "invoice_date",
  "paid_status",
]);
