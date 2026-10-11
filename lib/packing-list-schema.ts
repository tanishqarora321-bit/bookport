// Schema for extracting a packing list / Bill of Lading PDF's Seal No,
// total Weight, and Bale count - the 3 values the "Booking Instructions"
// letter needs (see lib/pdf/generateBookingInstructions.ts). A real BOL
// often lists per-bale weights in a grid; this only needs the TOTALS,
// not every individual bale line.
export const packingListExtractionSchema = {
  type: "object",
  properties: {
    container_number: { type: "string", nullable: true, description: "Container number printed on the document, for cross-checking against the container this is being uploaded to" },
    seal_no: { type: "string", nullable: true, description: "Seal number" },
    weight: { type: "number", nullable: true, description: "Total weight (sum across all bales/packages if a per-item breakdown is shown)" },
    weight_unit: { type: "string", nullable: true, description: "LBS or KG - whichever unit the weight is actually stated in" },
    bales: { type: "integer", nullable: true, description: "Total bale/package count (the QTY or number of bale rows, not a weight)" },
  },
  required: []
};
