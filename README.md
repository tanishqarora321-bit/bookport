# Bookport — MVP (Phase P0)

This is the first working slice of the app from the brief: **Booking & Instructions**
with manual entry, PDF-upload extraction, review-before-save, and the amendment
dialog with impact checking. Everything else (tracking, trucking assignment beyond
display, freight comparison, invoicing, dashboard) comes in the phases after this.

## What's actually running here

- `/bookings` — list, sorted by ETD, cargo cut-offs within 48h shown in red
- `/bookings/new` — choose manual entry or PDF upload; upload calls Gemini,
  pre-fills the form with confidence markers and the source quote from the PDF,
  nothing saves until you click Save
- `/bookings/[id]` — detail view; editing ETD/ETA/any cutoff/vessel opens an
  amendment dialog that checks trucking jobs and SI status for conflicts before
  saving, and writes a versioned amendment + audit log row
- `supabase/migrations/0001_init.sql` — the full 16-table+ schema with RLS
  (Operations role cannot read `charges`/`invoices` — cost is hidden from them
  per the brief)

## Setup (15 minutes)

1. **Create a Supabase project** — supabase.com, free tier is enough for the pilot.
2. **Run the migration**: Supabase dashboard → SQL Editor → paste the contents
   of `supabase/migrations/0001_init.sql` → Run.
3. **Create a Storage bucket** named `documents` (Supabase dashboard → Storage → New bucket, private).
4. **Get a Gemini API key**: aistudio.google.com/app/apikey — free tier covers
   your entire pilot.
5. **Copy `.env.example` to `.env.local`** and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     (Supabase dashboard → Settings → API)
   - `GEMINI_API_KEY`
6. **Install and run**:
   ```
   npm install
   npm run dev
   ```
   Open http://localhost:3000

7. **Seed a user manually for now**: Supabase dashboard → Authentication → Add user,
   then in the SQL editor:
   ```sql
   insert into profiles (id, full_name, role)
   values ('<the-user-id-from-auth>', 'Your Name', 'admin');
   ```
   (A real signup/login screen is P0 remainder — this repo assumes you're testing
   as one admin user for now.)

8. **Try it**: go to `/bookings/new` → Upload PDF → drop in one of the real
   booking confirmations you already have (Maersk, HMM, Evergreen, etc.) →
   review the pre-filled form → Save.

## Deploying (when ready to hand to the pilot agency)

- Push this repo to GitHub
- Import into Vercel, add the same env vars
- Vercel free tier + Supabase free tier covers the pilot per the brief's cost table

## Next phases (not built yet)

- P1: Tracking milestones, container CRUD, email notifications on amendment, document library
- P2: Freight comparison, offer sheet, branded PDF export
- P3: Charges ledger, AR/AP invoices generated from charges, P&L, dashboard
- P4: Settings depth (this is where `cutoff_label_aliases` becomes editable in
  the UI instead of a seeded table), CSV/Excel export, customer portal, QuickBooks push
