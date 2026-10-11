// Schema for extracting a buyer's own sales invoice PDF (a Final-Invoice
// style document: Booking #/Container #/Terms/Ship Date/Ship Via/Seal #/
// Reference # up top, then a Weight/Qty/Rate/Amount section with charge
// lines like "39 Bales Mixed Rags 38950 LBS@0.15=$5842.5", "Trucking
// @=$850", "Commission @=$389.5", "Ocean Freight @=$1847"). Each charge
// line becomes one item - description + amount only, since the DB's
// weight_kg/unit_price columns on buyer_invoice_items aren't needed for
// this extraction (that per-line granularity doesn't exist on these
// invoices the way it does on a supplier statement).
export const buyerInvoiceExtractionSchema = {
  type: "object",
  properties: {
    invoice_number: { type: "string", nullable: true, description: "The invoice's own number/reference, as printed" },
    invoice_date: { type: "string", nullable: true, description: "Invoice date, as an ISO 8601 date (YYYY-MM-DD)" },
    currency: { type: "string", nullable: true, description: "3-letter currency code the charges are stated in, e.g. USD" },
    booking_number: { type: "string", nullable: true, description: "Booking number, as printed" },
    container_number: { type: "string", nullable: true, description: "Container number, as printed" },
    weight: { type: "number", nullable: true, description: "Total weight figure printed on the invoice" },
    weight_unit: { type: "string", nullable: true, enum: ["LBS", "KG"], description: "Unit the weight is stated in" },
    bales: { type: "integer", nullable: true, description: "Bale/unit quantity, if printed (e.g. '39 Bales')" },
    items: {
      type: "array",
      nullable: true,
      description: "Each charge line on the invoice - e.g. the cargo value line plus Trucking/Commission/Ocean Freight lines.",
      items: {
        type: "object",
        properties: {
          description: { type: "string", nullable: true, description: "The line's description as printed, e.g. 'Mixed Rags' or 'Trucking'" },
          amount: { type: "number", nullable: true, description: "This line's total amount, as printed" }
        },
        required: ["amount"]
      }
    }
  },
  required: ["invoice_number"]
};
