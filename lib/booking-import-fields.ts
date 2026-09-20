export type ImportFieldKind = "text" | "date" | "party";

// Shared between the import mapping UI (app/bookings/import/page.tsx),
// Gemini's mapping suggestion (lib/gemini.ts) and the commit route
// (app/api/bookings/import/commit/route.ts) so all three agree on
// exactly which fields exist without repeating the list three times.
export const IMPORT_FIELDS: {
  key: string;
  label: string;
  kind: ImportFieldKind;
  role?: "forwarder" | "trucker" | "supplier" | "buyer";
  required?: boolean;
}[] = [
  { key: "carrier_booking_no", label: "Booking Number", kind: "text", required: true },
  { key: "erd", label: "ERD", kind: "date" },
  { key: "si_cutoff", label: "DOC Cut Off", kind: "date" },
  { key: "cargo_cutoff", label: "Cargo Cut Off", kind: "date" },
  { key: "pol", label: "Port of Loading (POL)", kind: "text" },
  { key: "pod", label: "Port of Discharge", kind: "text" },
  { key: "final_destination", label: "Port of Delivery", kind: "text" },
  { key: "bl_issued_at", label: "B/L Issued At", kind: "text" },
  { key: "carrier", label: "Shipping Line", kind: "text" },
  { key: "vessel", label: "Vessel", kind: "text" },
  { key: "container_no", label: "Container Number", kind: "text" },
  { key: "forwarder", label: "Forwarder", kind: "party", role: "forwarder" },
  { key: "trucker", label: "Trucker", kind: "party", role: "trucker" },
  { key: "supplier", label: "Supplier", kind: "party", role: "supplier" },
  { key: "buyer", label: "Buyer / Consignee", kind: "party", role: "buyer" },
];
