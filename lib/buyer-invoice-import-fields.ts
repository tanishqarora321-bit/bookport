// Target fields for importing a buyer account-statement sheet. Unlike the
// supplier invoice import (one invoice spans several rows), a real buyer
// account statement is one row = one complete invoice: Invoice Value,
// Freight, Trucking, and Commission are separate numeric COLUMNS on the
// same row, each becoming one buyer_invoice_items row. See
// app/api/buyer-invoices/import/commit/route.ts for the per-row logic.
export const BUYER_INVOICE_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "invoice_number", label: "Invoice Number", required: true },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "bl_date", label: "BL Date" },
  { key: "due_date", label: "Due Date" },
  { key: "container_number", label: "Container Number" },
  { key: "location", label: "Location" },
  { key: "booking_number", label: "Booking Number" },
  { key: "weight", label: "Weight" },
  { key: "invoice_value", label: "Invoice Value" },
  { key: "freight", label: "Freight" },
  { key: "trucking", label: "Trucking" },
  { key: "commission", label: "Commission" },
];

export const BUYER_INVOICE_DATE_KEYS = new Set(["invoice_date", "bl_date", "due_date"]);
export const BUYER_INVOICE_NUMERIC_KEYS = new Set(["weight", "invoice_value", "freight", "trucking", "commission"]);
