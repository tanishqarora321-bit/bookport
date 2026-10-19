// Target fields for importing Buyers/Customers. A buyer now has exactly
// one set of GST/IEC/shipping details (migration 0032 - the old
// "Folder's Name groups several GST entries under one buyer" model
// didn't match how this is actually used in practice), so each row is
// just one buyer account, full stop.
export const BUYER_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "legal_name", label: "Buyer / Company Name", required: true },
  { key: "address_line_1", label: "Address Line 1" },
  { key: "address_line_2", label: "Address Line 2" },
  { key: "address_line_3", label: "Address Line 3" },
  { key: "address_line_4", label: "Address Line 4" },
  { key: "gst_no", label: "GST No." },
  { key: "iec_code", label: "IEC Code" },
  { key: "mobile", label: "Mobile No." },
  { key: "email", label: "Email ID" },
  { key: "description_of_goods", label: "Description of Goods" },
  { key: "hs_code", label: "H.S. Code" },
];

// Joined with newlines into buyer_gst_entries.address on commit - the
// real sheet splits an address across 4 columns purely for its own
// layout, not because they're semantically different fields.
export const BUYER_ADDRESS_LINE_KEYS = ["address_line_1", "address_line_2", "address_line_3", "address_line_4"];
