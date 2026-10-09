// Schema for extracting a trucker's invoice PDF. Booking/container/route
// fields are deliberately NOT part of this schema - the invoice row this
// fills already exists (auto-created when the container got a trucker
// assigned, see supabase/migrations/0022_trucker_invoice_charges.sql),
// so extraction only needs the invoice-specific numbers a human would
// otherwise type in by hand. Fixed charge columns match the real C&K
// Trucking statement layout (Trucking/Fuel Surcharge/Chassis Rental/
// Stop Off/Chassis Split/misc), same "6 fixed fields + overflow" shape
// as the Forwarders schema.
export const truckerInvoiceExtractionSchema = {
  type: "object",
  properties: {
    invoice_number: { type: "string", nullable: true, description: "The invoice's own number/reference, as printed" },
    invoice_date: { type: "string", nullable: true, description: "Invoice date, as an ISO 8601 date (YYYY-MM-DD)" },
    invoice_due_date: { type: "string", nullable: true, description: "Payment due date, as an ISO 8601 date (YYYY-MM-DD). Null if not stated." },
    location: { type: "string", nullable: true, description: "Pickup/delivery location or terminal city, if stated (e.g. a yard or consignee city)" },
    currency: { type: "string", nullable: true, description: "3-letter currency code the charges are stated in, e.g. USD" },
    trucking: { type: "number", nullable: true, description: "Base trucking/line-haul/freight charge line, 0 if not present" },
    fuel_surcharge: { type: "number", nullable: true, description: "Fuel surcharge (FSC) charge line, 0 if not present" },
    chassis_rental: { type: "number", nullable: true, description: "Chassis rental/chassis charge line, 0 if not present" },
    stop_off: { type: "number", nullable: true, description: "Stop-off charge line, 0 if not present" },
    chassis_split: { type: "number", nullable: true, description: "Chassis split charge line, 0 if not present" },
    misc_charges: { type: "number", nullable: true, description: "A small/generic miscellaneous charge line that isn't worth naming separately, 0 if not present. If the invoice has a named charge type worth tracking on its own (e.g. 'Pre-Pull', 'Detention'), put it in other_charges instead of here." },
    other_charges: {
      type: "array",
      nullable: true,
      description: "Named charge lines that don't match any field above and are specific/significant enough to be worth tracking under their own name (not vague/generic - those go in misc_charges).",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The charge's own label as printed on the invoice, e.g. 'Pre-Pull'" },
          amount: { type: "number", description: "The charge amount" }
        },
        required: ["name", "amount"]
      }
    }
  },
  required: ["invoice_number"]
};
