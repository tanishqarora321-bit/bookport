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
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Invoice Date" },
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
  "invoice_number",
  "invoice_date",
]);
