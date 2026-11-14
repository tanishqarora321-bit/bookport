# Ship-Sphere (Bookport) — Developer Handoff

> **Living doc.** Update this at the end of every work session so a fresh Claude
> session (or a second account) can continue without losing context. Last
> updated: **2026-10-30**.

## What this is
A multi-tenant freight-forwarding SaaS. Repo folder name is "bookport"; the
in-app product name is **Ship-Sphere**. Stack: **Next.js 14 App Router +
TypeScript + Tailwind** (custom CSS-variable design system in
`app/globals.css`), **Supabase** (Postgres + Auth), **Google Gemini** for
Excel-import column mapping + PDF invoice extraction. Deployed on **Vercel** at
`https://www.ship-sphere.com` (auto-deploys on push to `main`).

The owner (Tanishq) is **non-technical** — explain decisions in plain language,
hand off with what changed and what to check, not implementation detail.

## Where things live
- **Repo:** GitHub `tanishqarora321-bit/bookport` (push to `main` = deploy).
- **Env / secrets:** `.env.local` in the project is NOT committed. Live keys and
  the Supabase password sit in **plaintext files on the owner's Desktop**
  (e.g. `env.download`). Never print or commit these. Test scripts read them
  from `C:/Users/anila/OneDrive/Desktop/Bookport/env.download`.
- **Node:** `C:\Program Files\nodejs\node.exe` (may not be on PATH).
- **Design reference:** `design-v2/SPEC.md` and `design-v2/screens/*.dc.html`.

## Dev workflow (follow exactly)
1. `git fetch origin` FIRST — **another workstream pushes directly to `main`**,
   so always rebase/branch off fresh `origin/main`.
2. Branch: `git checkout -b <topic> origin/main`.
3. Edit. Type-check: `npx tsc --noEmit`.
4. Build: `rm -rf .next && npx next build`.
5. Run + test locally against **real production Supabase**:
   `npx next start -p 3000` (background), then drive it with Playwright
   (`node_modules/playwright`, chromium installed). Sign in by minting a test
   user with the service-role key and setting the session cookie.
6. **Test-data hygiene (hard rule, there was a real data-loss incident):**
   every test row needs a literal marker (`ZZTEST…` names, `zztest…@example.com`
   emails); every cleanup delete must check its error and be scoped to those
   markers. Clean up all test rows + Playwright artifacts after.
7. Commit (end message with the `Co-Authored-By` line the session is told to
   use), `git fetch` again to confirm zero divergence, then
   `git push origin <topic>:main`, `git checkout main`, `git merge --ff-only`,
   delete the branch.
8. Confirm deploy: poll `curl -s -o /dev/null -w "%{http_code}" https://www.ship-sphere.com/login`
   after ~90s; expect 200.

Note: stray `error: failed to delete '.git/worktrees/agent-…': Permission
denied` lines on git commands are harmless noise — ignore them.

## Architecture you must know
- **Parties:** forwarders / truckers / suppliers / buyers are all rows in the
  `parties` table, filtered by `roles`. Each has a list page
  (`components/*Client.tsx`) and an invoice ledger
  (`components/*InvoiceLedgerClient.tsx`).
- **Invoice ledgers** auto-create one pending invoice per container once that
  party is assigned to a booking in Booking & Instructions. The ledger is the
  gold-standard UI (sticky blue Booking/Container columns via
  `table-layout:fixed` + `<colgroup>` width constants, merged filter bar inside
  the table card, pagination, `StatusMenuButton` portal dropdowns, a shared
  `PartyPaymentHistory`). **Forwarder (`InvoiceLedgerClient.tsx`) is the
  template; Trucker was made to match it.**
- **ETA (live) / Status (live)** are NOT columns on `*_invoices` — they live on
  the linked `tracking` row (`eta`, `release_status`). Ledger reads them via a
  join; edits and imports write to `tracking` by `tracking_id`.
- **Excel import** (`components/*ImportClient.tsx` + `app/api/*/import/parse` &
  `/commit`): upload → Gemini suggests column mapping → review → commit. Commit
  matches by Booking Number (+ Container Number when a booking has several),
  fills existing invoices or creates the booking+container+invoice. Repeat
  invoices (same booking+container, different invoice number) are cloned as
  separate rows (tracking_id left null — there's a unique constraint on it).
- **Booking stages** (`lib/bookings-data.ts` `fetchBookingsByStage`, one
  loader `lib/bookings-page.tsx`, one grid `BookingsClient` with `stage`):
  **Booking & Instructions** (`/bookings`, open), **Closed Bookings**
  (`/bookings/closed`) and **Cancelled Bookings** (`/bookings/cancelled`).
  Closed = status `delivered` (shown as "Closed" via `STATUS_LABELS` in
  `StatusPill` - the status check constraint has no "closed", so no migration)
  OR every field filled (`isBookingComplete`, which also saves the status).
  Cancelled = status `cancelled`. Rows are moved by selecting them (everyone,
  not just admins; bulk delete stays admin-only). The old **Multiple Bookings**
  page is gone (`/bookings/multiple` redirects to `/bookings?multiple=1`): a
  booking number with >1 container is flagged `is_multiple`, tinted amber in
  the grid, with a "Multiple only" filter chip.
- **Working Year applies to every module except Workspace**
  (`lib/year-scope.ts`): invoices by Month of Loading else Invoice Date;
  tracking by its booking's ERD else ETA; offer sheets by Period else
  created_at; anything undated shows under every year. Payment History lists
  payments whose `applies_to_year` is the Working Year, against that year's
  invoiced total. Freight Comparison follows the sidebar year (its Year picker
  sets it). Partner LIST pages (company names) aren't year-bound.
- **Booking filing date (2026-11):** a booking is filed under the Working
  Year/month by its ERD, else Cargo Cut Off, else DOC Cut Off
  (`filingDate` in BookingsClient; Tracking mirrors it). A booking with none
  is NEVER hidden: it shows under every year, with a "No ERD" badge and
  filter chip. (Before, a blank ERD hid a booking under every year - an
  owner import of 738 rows "lost" 301 that way.) The bookings import asks
  "Year this sheet applies to" (month-only dates use it), merges booking
  fields across a booking's rows, and lists bookings with no date at all on
  a "Missing dates" step (leave undated, or set Month of Loading).
- **Custom columns:** `*_invoice_custom_columns` tables (number/text/date),
  appended to import fields + ledger at runtime, max 10.

## Current status (2026-10-30)
- **Forwarders module:** complete — list redesign, ledger, import (incl. ETA/
  Status mapping + erd backfill), Payment History ($ formatting, 3/page,
  buttons in header), square back buttons everywhere.
- **Truckers module:** complete — list page + ledger now match Forwarders
  exactly; import maps all columns incl. ETA/Status and writes tracking; booking
  matching + single/multiple-booking creation like Forwarders.
- **Booking/Multiple split:** fixed to count containers.
- **Import never drops a row (2026-10-30):** forwarder & trucker commit routes
  now create the invoice shell directly as a fallback when an existing
  booking+container's shell is missing, instead of skipping. (Found via QFS:
  4 of 260 trucker rows were silently dropped because their containers already
  existed from the forwarder import.)
- **Trucker import asks the year for new bookings (2026-10-30):** matching
  existing Booking+Container ignores the year. Booking numbers not found in
  ANY year are listed on a new "New bookings" step (after Duplicates) with a
  year picker; they're created with ERD = that year + the sheet's month
  (Month of Loading → Invoice Date → ETA → January). >1 container is flagged
  as going to Multiple Bookings. Not yet ported to Forwarders/Suppliers/Buyers.
- **Suppliers module (2026-10-30):** list page = Truckers layout; ledger has
  frozen blue Booking/Container columns, merged filters, pagination,
  StatusMenuButton pills, editable live ETA/Status; Cost section button styled
  like "Details". Import is now match-or-assign like Trucker (Duplicates +
  New bookings steps, Month of Loading / ETA / Status / Paid mappable); one
  invoice = a Booking Number row + the cost-line rows under it; re-importing
  REPLACES that invoice's cost lines (never doubles them).
- **Booking details page** (`app/bookings/[id]`, 2026-11): redesigned from
  the owner's design handoff (header + Upload BL / Send Instructions, state-
  driven progress strip - a cancelled booking shows no "current" stage -,
  Dates & Cut-offs with amendments, Routing, Trucking, details; right rail
  Connected Records with invoice STATES, Parties, Estimated Margin shown only
  when the financial data is complete, Containers). Amendments
  (`DatesCard.tsx` + `/api/amendments`): **Check** calls the API with
  `preview: true` (impact only, nothing saved), **Save** saves as the next
  version; reason required server-side, dates validated, `expected_version`
  guards stale pages (409). The page is scoped to the signed-in company.
- **Buyers module (2026-11, first pass):** list = Forwarders layout (toggle,
  equal KPI cards, search in card, bordered Shipping Details / Details
  buttons); ledger = frozen blue Booking/Container, merged filters,
  pagination, Status/Paid pill menus, editable live ETA/Status. Clearing the
  Buyer in Booking & Instructions now deletes their buyer invoices for that
  booking (like the other parties), and deleting a booking clears
  buyer_invoices too (it used to fail with a tracking FK error after the
  other invoices were already gone). No Payment History on buyers yet - P&L
  counts buyer receipts from invoice paid_status, not party_payments.
- **Bookings import maps packing + Instruction Status (2026-11):** Seal No /
  Weight / Weight Unit (KGS->KG) / Bales go into each ROW's own container's
  `container_packing_items`; "SENT"/"NOT SENT" -> instruction_status. A
  booking number already saved defaults to **"Fill in missing details"**
  (blank fields, unassigned parties, missing containers, containers without
  packing) - never overwrites; re-importing is idempotent. Dates that don't
  exist (29-02-2026) roll forward to the next day and are listed on Done.
- **Shipment Tracking (2026-11, owner spec):** one row per container
  (`app/tracking/page.tsx` + `components/TrackingClient.tsx`), created by
  `sync_container_to_tracking` the moment a container number is added -
  every booking, open/closed/cancelled. Columns: Booking + Container (both
  frozen), Shipping Line, Forwarder, Trucker, Supplier, Consignee / Buyer
  (all read LIVE from the booking + booking_parties), BL Number (booking's
  `bl_number` from Upload BL / manual entry) + BL Status (Y when there is a
  BL number, else N), Invoice Number (`buyer_invoices.invoice_number`, made
  by Generate Invoice in the Buyers ledger), Invoice Sent, Docs Sent, ETA,
  Release Status, Last Checked, Remarks, Docs. **ETA and Release Status are
  the master here**: every party ledger shows them read-only; invoice
  imports only FILL a blank ETA/Status (`lib/tracking-master.ts`), never
  overwrite. Last Checked = stamped whenever ETA changes (PATCH
  /api/tracking/[id]) or by hand (✓ button). **Docs** opens a dialog with
  the latest Invoice / Fumigation Cert / Certificate of Origin / Set of
  Documents PDFs and emails them to the buyer (`/api/tracking/[id]/send-docs`,
  compose -> preview -> send like Send Instructions, PDFs attached via
  Resend `attachments`): sending the invoice flips Invoice Sent, sending
  the documents flips Docs Sent. Generating a PDF no longer flips either.
  The old "Invoice →" full invoice page now lives in the Buyers ledger
  (column after Generate Invoice; `?back=` returns to that ledger).
- **Fumigation Certificate (2026-11):** the owner's REAL International
  Fumigators certificate is the template
  (`lib/pdf/assets/fumigation-certificate-template.pdf`, their Excel print
  with logo + signature; the old date/year/container were stripped from its
  text once). Only TWO values change: the date (BL date + 3 days, "DD
  MONTH" + bold underlined year) and the container number - "Located at
  SEATTLE USA" and everything else stay as printed (owner rule). Printed in
  Caladea (OFL look-alike of the original's Cambria) at Cambria's spacing,
  with ActualText so copy/search reads the values. Assets are shipped to
  the route via `outputFileTracingIncludes` in next.config.js.
- **Certificate of Origin + Set of Documents (2026-11):** exact copies of
  the owner's real PDFs (`lib/pdf/assets/*-template.pdf`, per-shipment
  values stripped out; positions in `lib/pdf/slots/*`), filled by
  `lib/pdf/templateFill.ts` with OFL fonts metric-identical to the
  originals (Liberation Sans/Serif, Carlito; kerning off; Carlito embedded
  whole - fontkit's subsetting drops its glyphs). Owner decisions: date =
  BL date + 3 days; exporter/letterhead = Settings letterhead (company name
  + address; COO also CONTACT/TEL, in capitals like the sample); "1X 40
  FCL" follows the booking's Container Size; everything else (SEA - 0,
  MUNDRA SEAPORT, CAD, PRE-PAID, stamps, Chamber of Commerce block) stays as
  printed; COO "SEAL#" printed as "SEAL" (earlier owner request). Bank
  details come from the Set of Documents template in Settings, else the
  sample's own. Rebuilding a template: `scripts/pdf-templates/README.md`.
- **Invoice (Final Invoice, 2026-11):** exact copy of the owner's real
  INVOICE (`lib/pdf/assets/final-invoice-template.pdf`, slots in
  `lib/pdf/slots/finalInvoice.ts`), same engine as COO/SOD. The documents
  route now fills everything from the buyer invoice row (invoice no./date,
  weight + unit, Cost section lines), the booking's Supplier (the line under
  the charges, e.g. "GOODWILL Nashville"), the container's packing
  (bales, seal) and the buyer's shipping details; Invoice-page edits
  override, but blank overrides are ignored (the old 01/01/1970 bug). Each
  Cost section line = one invoice line: weight + unit price ->
  "39 Bales Mixed Rags 38950 LBS@0.15=$5842.5"; amount only -> indented
  "Trucking  @=$850"; up to 6 lines (more are joined on the last); total =
  sum. Letterhead from Settings (capitals), "By:" = the signed-in user,
  Ship Date = invoice date, Reference # blank by default (owner adds it
  on the Invoice page after confirming with the client).
- **Forwarders polish (2026-11):** list + ledger header buttons are equal
  width (grid of equal columns); the list's table header is sticky; the
  ledger's clear-filters is the round ✕ like Booking & Instructions.
  **Payments & History** is now a button next to Import Excel / Add Column
  that opens Payment History in a right-side drawer (`PartyPaymentHistory`
  `variant="drawer"`). REVERSIBLE: set `PAYMENTS_LAYOUT = "card"` in
  `lib/ui-flags.ts` to get the old inline card back (owner asked to be able
  to undo it). Truckers/Suppliers still use the card.
- **Forwarder invoice PDFs (2026-11):** an invoice entered by uploading its
  PDF (Enter Invoice) keeps the PDF in the `documents` bucket at
  `{company}/{tracking}/forwarder-invoice-{invoiceId}.pdf`
  (`lib/forwarder-invoice-pdf.ts`, no migration) and shows it in Shipment
  Tracking's Docs dialog (view only, never emailed). Manual / Excel-import
  invoices store nothing. The PDF is deleted with its invoice: invoice
  delete, clearing the forwarder on the booking, container or booking
  delete.
- **Shared UI:** `components/ui/` — `BackButton`, `ToggleSwitch`, `StatCard`,
  `StatusMenuButton`, `StatusPill`, `AddColumnPanel`, `BulkActionBar`.

## Import matching rule (owner requirement — must hold for ALL party imports)
On import, match each row by **Booking Number + Container Number**:
- If that combo already exists (Booking & Instructions OR Multiple Bookings),
  **assign the party** (forwarder/trucker/supplier/buyer name) to that existing
  booking — do NOT create a duplicate booking.
- If it doesn't exist, create the booking (lands in B&I if single-container,
  Multiple Bookings if the number has >1 container).
- Only create a genuinely separate entry when the SAME booking+container combo
  is deliberately reused with a different invoice number.
Verified live for **Forwarder + Trucker** (assign-not-duplicate, idempotent on
re-import). **Supplier** follows it (2026-10-30) and so does **Buyer** since
2026-11 (Duplicates + New bookings steps; a row with no Booking Number finds
the booking by its Container Number; Invoice Value / Freight / Trucking /
Commission become Cost section lines, replaced on re-import).

**Booking-level values in party imports (owner rule, 2026-11, all four):**
Month of Loading / ERD, Shipping Line, POL, Port of Discharge, Port of
Delivery are mappable everywhere. A booking the import creates takes them
from the sheet; an existing booking (matched by Booking + Container) only
takes the ones still BLANK in Booking & Instructions - what's set there
wins (`fillBookingBlanks` in `lib/import-booking-fields.ts`, which also
copies a filled Shipping Line/POL/POD onto that booking's forwarder
invoices where blank). After that they change only in Booking &
Instructions. ETA/Status stay fill-only on Shipment Tracking.

Repeat invoices on one booking+container: the commit route matches the
existing invoice with the SAME invoice number first, then a pending (blank)
one, and only then adds a separate invoice - Trucker + Supplier do this; the
**Forwarder** route still compares only against the newest invoice, so
re-importing a sheet with repeat invoices there can duplicate them (fix it
the same way). A bare month name ("MARCH") on an existing booking takes the
booking's own ERD year (Trucker + Supplier).

## Likely next work
- Port the repeat-invoice matching fix to the Forwarder import (see above).
- Any further booking visibility / import reconciliation requests.

## Gotchas
- Import source sheets are often **AR statements** whose "Total" column is a
  running balance, NOT a sum of the charge columns — the app sums the mapped
  charge columns (correct), so it will differ from that "Total" column. Map the
  real charge columns; don't map "Total".
- **Writing to the real company's data (955acd8e) is gated** by the sandbox's
  "modify shared resources" guard — direct prod inserts get blocked and need the
  owner's explicit OK. Prefer fixing via the app's own import/UI path, or ask.
- Payment History fetch can take a moment; in tests wait for it before asserting.
- `body`/`html` are locked to the viewport (`overflow:hidden`) so only the app's
  own scroll regions scroll — keep that when adding full-height pages.
- Test only against the test company `00000000-0000-0000-0000-000000000001` with
  ZZTEST markers; never leave test rows in the real company.
