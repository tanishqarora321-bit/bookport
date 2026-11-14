import { IMPORT_BOOKING_ERD_LABEL, IMPORT_BOOKING_FIELDS, IMPORT_BOOKING_FIELD_KEYS } from "./import-booking-fields";

// Target fields for importing a buyer account-statement sheet - one row = one
// invoice for one container. Works like the Forwarders / Truckers / Suppliers
// imports (2026-11): each row is matched by Booking Number + Container Number
// in any year and fills that container's buyer invoice (assigning this buyer
// to the booking when it isn't yet); a booking number found nowhere is
// created, in the year picked on the "New bookings" step. Invoice Value /
// Freight / Trucking / Commission become the invoice's Cost section lines
// (re-importing replaces those lines, never doubles them).
export const BUYER_INVOICE_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  // A buyer statement without Booking Numbers still works: the Container
  // Number finds the booking.
  { key: "booking_number", label: "Booking Number (or map Container Number)" },
  { key: "container_number", label: "Container Number" },
  { key: "location", label: "Location" },
  { key: "erd", label: IMPORT_BOOKING_ERD_LABEL },
  // Booking columns (lib/import-booking-fields.ts): a new booking takes
  // them from the sheet; an existing one only where Booking & Instructions
  // is still blank.
  ...IMPORT_BOOKING_FIELDS,
  // On the container's Shipment Tracking row (the ledger's ETA / Status
  // (live)) - fills only a blank there; Shipment Tracking is the master.
  { key: "eta", label: "ETA (live)" },
  { key: "release_status", label: "Status (live)" },
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "bl_date", label: "BL Date" },
  { key: "due_date", label: "Due Date" },
  { key: "weight", label: "Weight (LBS, or KG when the cell says KG)" },
  { key: "invoice_value", label: "Invoice Value" },
  { key: "freight", label: "Freight" },
  { key: "trucking", label: "Trucking" },
  { key: "commission", label: "Commission" },
  { key: "currency", label: "Currency" },
  { key: "paid_status", label: "Paid / Not Paid" },
];

export const BUYER_INVOICE_BOOKING_KEYS = new Set<string>(IMPORT_BOOKING_FIELD_KEYS);
export const BUYER_INVOICE_TRACKING_KEYS = new Set(["eta", "release_status"]);
export const BUYER_INVOICE_DATE_KEYS = new Set(["invoice_date", "bl_date", "due_date"]);
// Mapped charge column -> the Cost section line it becomes.
export const BUYER_INVOICE_CHARGE_LINES: { key: string; description: string }[] = [
  { key: "invoice_value", description: "Invoice Value" },
  { key: "freight", description: "Freight" },
  { key: "trucking", description: "Trucking" },
  { key: "commission", description: "Commission" },
];
export const BUYER_INVOICE_NUMERIC_KEYS = new Set(["weight", "invoice_value", "freight", "trucking", "commission"]);
