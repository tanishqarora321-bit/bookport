// Schema for extracting a freight rate sheet PDF (e.g. a forwarder's monthly
// "Origin x Shipping Line -> rate" table like UAL's or Walker's emails).
//
// Kept flat and lean, same reasoning as booking-schema.ts: one row per
// (origin, shipping_line) rate cell, no nested confidence/source_quote per
// row -- these sheets commonly have 40-90 rate cells, and per-field
// metadata at that volume risks the same output-length cutoff problem
// booking-schema.ts's comment warns about.

export const rateSheetExtractionSchema = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Origin city/port/ramp as written, e.g. 'NEW YORK' or 'ATLANTA, GA'" },
          shipping_line: { type: "string", description: "Carrier name, e.g. MSC, MAERSK, HAPAG, COSCO, CMA CGM, ONE, HMM, EVERGREEN, OOCL" },
          rate: { type: "number", nullable: true, description: "USD rate for this origin+carrier. Omit the entry entirely (do not include it) if the cell is blank or shows '-'." },
          free_days: { type: "integer", nullable: true, description: "Free days at destination for this carrier, if stated anywhere on the sheet (often in a footer note like '12 free days on MSC/HAPAG'). Null if not stated." }
        },
        required: ["origin", "shipping_line", "rate"]
      }
    }
  },
  required: ["entries"]
};
