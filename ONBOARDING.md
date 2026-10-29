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
- **Shared UI:** `components/ui/` — `BackButton`, `ToggleSwitch`, `StatCard`,
  `StatusMenuButton`, `StatusPill`, `AddColumnPanel`, `BulkActionBar`.

## Likely next work
- Bring **Suppliers** and **Buyers** modules to the same parity (list redesign,
  ledger sticky columns/filters/pagination, import all-columns + ETA/Status
  where applicable). Supplier/Buyer ledgers + imports still use the older layout.
- Any further booking visibility / import reconciliation requests.

## Gotchas
- Import source sheets are often **AR statements** whose "Total" column is a
  running balance, NOT a sum of the charge columns — the app sums the mapped
  charge columns (correct), so it will differ from that "Total" column. Map the
  real charge columns; don't map "Total".
- Payment History fetch can take a moment; in tests wait for it before asserting.
- `body`/`html` are locked to the viewport (`overflow:hidden`) so only the app's
  own scroll regions scroll — keep that when adding full-height pages.
