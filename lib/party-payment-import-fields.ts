// Target fields for importing a batch of payments against one party's
// Payment History (party_payments - shared by Forwarders/Truckers/
// Suppliers, see components/PartyPaymentHistory.tsx and
// app/api/party-payments/route.ts, which this import loops the same
// validation/defaults of).
export const PARTY_PAYMENT_IMPORT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "amount", label: "Amount", required: true },
  { key: "currency", label: "Currency" },
  { key: "fx_rate", label: "FX Rate to USD" },
  { key: "paid_on", label: "Date" },
  { key: "applies_to_year", label: "Applies to Year" },
  { key: "note", label: "Note" },
];

export const PARTY_PAYMENT_DATE_KEYS = new Set(["paid_on"]);
export const PARTY_PAYMENT_NUMERIC_KEYS = new Set(["amount", "fx_rate", "applies_to_year"]);
