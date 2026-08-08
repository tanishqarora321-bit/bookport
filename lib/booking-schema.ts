// v2 — rebuilt around exactly the 11 fields that matter for the first
// impression of the AI extraction, per direct field-by-field spec.
// Kept lean on purpose: the more fields/nesting in the schema, the longer
// the model's output, and long output on documents with huge legal
// boilerplate (Evergreen, COSCO) was cutting off mid-string. Fewer fields
// now, add back containers/legs/charges once this core set is solid.

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
const datetimeField = field({ type: "string", nullable: true, description: "ISO 8601 datetime" });

export const bookingExtractionSchema = {
  type: "object",
  properties: {
    // 1. Mandatory — never leave this null in practice; if truly unreadable,
    // return the best guess with low confidence rather than null.
    booking_number: field({ type: "string" }),

    // 2. Not present on every document — leave null rather than guess.
    erd: dateField,

    // 3 & 4. The two most commonly mislabeled fields — see alias notes in the prompt.
    doc_cutoff: datetimeField,
    cargo_cutoff: datetimeField,

    // 5-8. Routing
    pol: str,
    port_of_discharge: str,
    port_of_delivery: str,
    bl_issued_at: str,

    // 9-10. Who's who — these get mixed up across doc types, see prompt notes.
    shipping_line: str,
    forwarder_name: str,

    // 11.
    container_size: str
  },
  required: ["booking_number"]
};
