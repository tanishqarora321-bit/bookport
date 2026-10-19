// Mirrors lib/booking-schema.ts's field() envelope pattern for the
// top-level scalar fields. The `containers` array is deliberately left
// as PLAIN objects (no per-field confidence/source_quote wrapper) -
// booking-schema.ts's own comment warns that heavier nesting makes
// Gemini's output longer and risks truncation on documents already
// full of legal boilerplate; the review screen lets the user correct
// any container row regardless, so the extra wrapper buys nothing here.

function field(valueSchema: object) {
  return {
    type: "object",
    properties: {
      value: valueSchema,
      confidence: { type: "number" },
      source_quote: { type: "string", description: "Short phrase only — 15 words max, not a whole paragraph" }
    },
    required: ["value", "confidence", "source_quote"]
  };
}

const str = field({ type: "string", nullable: true });
const dateField = field({ type: "string", nullable: true, description: "ISO 8601 date" });

export const blExtractionSchema = {
  type: "object",
  properties: {
    bl_number: field({ type: "string" }),
    bl_date: dateField,
    place_of_issue: str,
    vessel: str,
    voyage: str,
    pol: str,
    pod: str,
    place_of_receipt: str,
    description_of_goods: str,
    hs_code: str,
    containers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          container_no: { type: "string", nullable: true },
          seal_no: { type: "string", nullable: true },
          gross_weight: { type: "number", nullable: true },
          weight_unit: { type: "string", nullable: true, description: "KGS or LBS, exactly as shown on the document" },
          bales: { type: "number", nullable: true, description: "number of packages/bales/cartons for this container" }
        }
      }
    }
  },
  required: ["bl_number"]
};
