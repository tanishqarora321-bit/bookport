// Schema for reading a forwarder's monthly rate sheet (PDF email or Excel):
// a table of origin x shipping line -> rate to one destination, plus the
// forwarder's name, free days per line and the extra charges it lists.
//
// Kept flat (one entry per rate cell, no per-cell metadata) - these sheets
// run 40-300 rate cells and per-field metadata risks cutting the output off.
export const rateSheetExtractionSchema = {
  type: "object",
  properties: {
    forwarder_name: {
      type: "string",
      nullable: true,
      description: "The forwarder / freight company that sent these rates (e.g. 'UAL', 'Walker SCM', 'Speedex'), from the sender, signature or title. Null if unclear.",
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Origin city/port/ramp as written, e.g. 'NEW YORK' or 'Chicago, IL Ramp'" },
          forwarder: {
            type: "string",
            nullable: true,
            description: "ONLY when the table has columns for several forwarders (headers like 'UAL - COSCO', 'Speedex - MSC', 'Walker - HAPAG-LLOYD'): the forwarder part of this column's header. Null for a normal one-forwarder sheet.",
          },
          shipping_line: { type: "string", description: "Carrier, e.g. MSC, MAERSK, HAPAG-LLOYD, COSCO, CMA CGM, ONE, HMM, EVERGREEN, OOCL, WAN HAI" },
          rate: { type: "number", nullable: true, description: "USD rate for this origin+carrier. Omit the entry if the cell is blank, '-' or '--'." },
          free_days: { type: "integer", nullable: true, description: "Destination free days for this carrier (and origin, if the sheet varies it by origin). Null if not stated." },
        },
        required: ["origin", "shipping_line", "rate"],
      },
    },
    charges: {
      type: "array",
      description: "Extra charges the sheet lists (telex/doc release, AES filing, handling per BL, manifest corrections, cancellation...).",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Short name, e.g. 'DOC/Telex release', 'AES filing', 'Handling per BL', 'Manifest correction'" },
          amount: { type: "number", nullable: true, description: "USD amount" },
          shipping_lines: { type: "array", items: { type: "string" }, description: "Carriers it applies to; empty = all carriers" },
        },
        required: ["label"],
      },
    },
  },
  required: ["entries"],
};
