// Schema for extracting a forwarder's invoice PDF. Booking/container/route
// fields are deliberately NOT part of this schema - the invoice row this
// fills already exists (auto-created when the container got a forwarder
// assigned, see supabase/migrations/0015_forwarder_invoice_automation.sql),
// so extraction only needs the invoice-specific numbers a human would
// otherwise type in by hand.
export const forwarderInvoiceExtractionSchema = {
  type: "object",
  properties: {
    invoice_number: { type: "string", nullable: true, description: "The invoice's own number/reference, as printed" },
    invoice_date: { type: "string", nullable: true, description: "Invoice date, as an ISO 8601 date (YYYY-MM-DD)" },
    invoice_due_date: { type: "string", nullable: true, description: "Payment due date, as an ISO 8601 date (YYYY-MM-DD). Null if not stated." },
    currency: { type: "string", nullable: true, description: "3-letter currency code the charges are stated in, e.g. USD or INR" },
    freight_charges: { type: "number", nullable: true, description: "Ocean freight charge line, 0 if not present" },
    bl_fees: { type: "number", nullable: true, description: "Bill of Lading / documentation fee line, 0 if not present" },
    aes_fees: { type: "number", nullable: true, description: "AES filing fee line, 0 if not present" },
    extra_charges: { type: "number", nullable: true, description: "A small/generic miscellaneous surcharge line that isn't worth naming separately, 0 if not present. If the invoice has a named charge type worth tracking on its own (e.g. 'Chassis Fee', 'Fumigation'), put it in other_charges instead of here." },
    correction_charges: { type: "number", nullable: true, description: "Manifest/BL correction charge line, 0 if not present" },
    demurrage: { type: "number", nullable: true, description: "Demurrage/detention charge line, 0 if not present" },
    other_charges: {
      type: "array",
      nullable: true,
      description: "Named charge lines that don't match any field above and are specific/significant enough to be worth tracking under their own name (not vague/generic - those go in extra_charges).",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The charge's own label as printed on the invoice, e.g. 'Chassis Fee'" },
          amount: { type: "number", description: "The charge amount" }
        },
        required: ["name", "amount"]
      }
    }
  },
  required: ["invoice_number"]
};
