// Forwarders/Truckers/Suppliers/Buyers are all `parties` rows (see
// components/PartyPickerCell.tsx) - same 4 fields regardless of role,
// so one import flow (app/api/parties/import/*, components/
// PartyImportClient.tsx) serves all of them, parameterized by role.
export const PARTY_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "legal_name", label: "Name", required: true },
  { key: "short_code", label: "Short Code" },
  { key: "country", label: "Country" },
  { key: "address", label: "Address" }
];

export type PartyRole = "forwarder" | "trucker" | "supplier" | "buyer";
