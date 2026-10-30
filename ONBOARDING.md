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
- **Booking & Instructions vs Multiple Bookings** (`lib/bookings-data.ts`):
  the split counts **containers** per booking number (after flattening to one
  row per container). A booking number with >1 container → **Multiple Bookings
  & Instructions**; exactly one container → main page. (Owner's definition:
  same number + different container numbers = "multiple".)
- **`booking.erd` is the visibility key:** Booking & Instructions hides any
  booking with a null `erd` (`inYearScope`). Imports MUST set `booking.erd`
  from the row's Month of Loading (backfilled only when null). A one-time repair
  on 2026-10-29 set `erd` on 320 bookings imports had left null.
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
re-import). **Supplier + Buyer imports do NOT yet follow this** (older
structure, no link-existing branch) — align them when doing those modules.

## Likely next work
- Bring **Suppliers** and **Buyers** modules to the same parity: list redesign,
  ledger (sticky blue Booking/Container columns, merged filters, pagination,
  StatusMenuButton), import (all columns mappable + ETA/Status, and the
  booking+container match-or-create rule above, incl. the no-drop fallback).
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
