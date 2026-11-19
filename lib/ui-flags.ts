// Layout switches that the owner may want to flip back.
//
// PAYMENTS_LAYOUT (Forwarder invoice ledger, 2026-11):
//   "drawer" - a "Payments & History" button next to Import Excel / Add
//              Column opens Payment History in a side panel, so the ledger
//              table gets the full height (current design).
//   "card"   - the previous design: the Payment History card sits between
//              the KPI cards and the ledger table.
// To reverse it, set this to "card" - nothing else needs to change.
export const PAYMENTS_LAYOUT: "drawer" | "card" = "drawer";

// Modules shown as "Coming soon" (page + a "Soon" tag in the sidebar)
// instead of their unfinished screens (owner, 2026-11-19). Remove a key to
// open that module again - its code is untouched.
export const COMING_SOON = new Set<string>(["offers"]);
