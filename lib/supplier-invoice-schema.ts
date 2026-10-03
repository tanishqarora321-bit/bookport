// Schema for extracting a supplier's invoice PDF (e.g. RECUTEX). Unlike
// the forwarder invoice schema (6 fixed charge fields), a supplier
// invoice is a line-item cost section - description + weight + unit
// price per line, same shape as the "Cost Section" table a human fills
// in manually. Booking/container fields are deliberately NOT part of
// this schema; the invoice row this fills already exists (either
// auto-created from the booking's tracking entry, or the person is
// filling in the booking lookup separately), so extraction only needs
// the invoice-specific numbers a human would otherwise type in by hand.
export const supplierInvoiceExtractionSchema = {
  type: "object",
  properties: {
    invoice_number: { type: "string", nullable: true, description: "The invoice's own number/reference, as printed" },
    invoice_date: { type: "string", nullable: true, description: "Invoice date, as an ISO 8601 date (YYYY-MM-DD)" },
    currency: { type: "string", nullable: true, description: "3-letter currency code the charges are stated in, e.g. EUR or USD" },
    items: {
      type: "array",
      nullable: true,
      description: "Each cost line on the invoice - e.g. a commodity/description with its weight and unit price.",
      items: {
        type: "object",
        properties: {
          description: { type: "string", nullable: true, description: "The line's description as printed, e.g. 'DAMAGED CLOTHING'" },
          weight_kg: { type: "number", nullable: true, description: "Weight in KG for this line, null if not applicable" },
          unit_price: { type: "number", nullable: true, description: "Per-unit (per-KG) price for this line, null if not applicable" },
          amount: { type: "number", nullable: true, description: "This line's total amount - if not printed separately, this is weight_kg * unit_price" }
        },
        required: ["amount"]
      }
    }
  },
  required: ["invoice_number"]
};
