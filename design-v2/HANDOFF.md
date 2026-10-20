# Ship-Sphere v2 — UI redesign handoff (for Claude Code)

This folder holds the approved v2 design for this app. **It is a UI/UX restyle only.** Do not change data models, API routes, Supabase queries, business rules, invoice numbering or PDF generation logic.

## What's in here
- `SPEC.md`: the design rules. It includes the full **TOKENS** CSS block (light, dark and system themes), component classes, status-badge mapping, table rules and the design language.
- `screens/*.dc.html`: one file per screen, in HTML. Open them in a browser for a rough look, or read them for exact labels, layout, spacing and colors.
  - They use design-tool markup. Ignore `<x-dc>`, `<helmet>`, `<sc-for>`, `<sc-if>`, `<dc-import>`, `{{holes}}` and the `class Component extends DCLogic` script. Read them as layout and style reference.
  - **All data in them is sample data.** Keep the app's real data and behaviour.
- `screens/V2DesignSystem.dc.html`: the master reference for every button, input, badge and dropdown state.

## Screen → code map
| Design file | Implement in |
|---|---|
| V2Nav | `components/Sidebar.tsx` (navy sidebar, grouped sections, Year selector, user footer, collapse) |
| V2Bookings | `app/bookings/page.tsx`, `components/BookingsClient.tsx`, `ui/StatCard.tsx`, `StatusCell.tsx` |
| V2CellEditing | `EditableCell.tsx`, `PartyPickerCell.tsx`, `PackingItemsCell.tsx`, `ContainerCell.tsx`, `StatusCell.tsx`, `ui/InlineEditText.tsx` |
| V2UploadBL | `UploadBlCell.tsx` (3-step modal) |
| V2SendInstructions | `SendInstructionsCell.tsx` |
| V2Multiple | `app/bookings/multiple` (BookingsClient `variant="multiple"`): group rows by booking number |
| V2NewBooking | `app/bookings/new` (chooser, review form, duplicate dialog) |
| V2Import | `app/bookings/import` plus every `*ImportClient.tsx` (same 4-step wizard look everywhere) |
| V2BookingDetail | `app/bookings/[id]` (dates and amendments, routing, trucking empty state, details) |
| V2Tracking | `components/TrackingClient.tsx` |
| V2FinalInvoice | `app/tracking/[id]/documents`, `DocumentsClient.tsx` |
| V2Buyers | `components/PartiesClient.tsx` |
| V2BuyerLedger | `BuyerInvoiceLedgerClient.tsx`; also apply the same look to `SupplierInvoiceLedgerClient.tsx` (no document buttons) |
| V2Partners | `ForwardersClient.tsx`, `SuppliersClient.tsx`, `TruckersClient.tsx` |
| V2ForwarderLedger | `InvoiceLedgerClient.tsx`, `TruckerInvoiceLedgerClient.tsx`, `PartyPaymentHistory.tsx` |
| V2Freight | `FreightComparisonClient.tsx` |
| V2OfferSheets | `OfferSheetsListClient.tsx`, `OfferSheetGridClient.tsx` |
| V2ProfitLoss | `ProfitLossClient.tsx` |
| V2Settings | `app/team`, `TeamClient.tsx`, `ChangePasswordCard.tsx`, `LetterheadSettingsCard.tsx`, `EmailSettingsCard.tsx` |
| V2Admin | `app/admin`, `AdminCompaniesClient.tsx` |
| V2Login | `app/login`, `app/auth/callback` |

## Changes beyond restyling (small, approved)
1. **Theme switch: Light / Dark / System.**
   - Put the TOKENS from SPEC.md in `app/globals.css` as CSS variables on `html.th-light`, `html.th-dark` and `html.th-system`.
   - Map them in `tailwind.config.js`, e.g. `colors: { surf: 'var(--surf)', ... }`, or use the classes directly.
   - Save the choice in localStorage. Set the class with a tiny inline script in `app/layout.tsx` before paint, so the page doesn't flash the wrong theme.
   - The switch lives in a slim top bar (breadcrumb on the left, theme switch on the right).
2. **Rename the "Vessel" grid column to "Container Size".** It already stores `container_size`. Update the CSV export header to match.
3. **Tracking quick filters:** a search box plus "Invoice pending", "Docs pending" and "BL pending" chips. Client-side filtering only.
4. **Remove the unfinished sections** "Invoices & Statement" and "Dashboard & Reports" from the sidebar, along with their `/soon/*` links. **Confirm with the owner (Tanishq) which sections he is deleting before removing anything.**

## Rules
- Keep every existing label, column order, filter, option value, modal field and message exactly as it is in the code. The design was built from them.
- Fonts: Geist and Geist Mono via `next/font/google`. Use Geist Mono for booking, container, BL and invoice numbers, and tabular numbers for money.
- Brand colors stay: navy `#0C1A3A` (sidebar) and accent `#2F5FE0`. Colors are for meaning only. Status badges always show their text (see SPEC.md's map).
- Accessibility:
  - Real `<button>`, `<label>` and `<select>` elements.
  - `aria-label` on icon-only buttons.
  - A visible focus ring.
  - Text contrast of at least 4.5:1 in both themes.
- Work **one screen at a time**, in this order:
  1. Sidebar and tokens
  2. Booking & Instructions
  3. Cell editing
  4. Modals
  5. Tracking
  6. Buyers and ledgers
  7. The rest
- **After each screen, run `npx tsc --noEmit` and `npm run build`, and fix every error before moving on.** Watch for strict-mode implicit `any` in Supabase `.map()` callbacks.
- Give the owner numbered deployment steps at the end of each screen.
