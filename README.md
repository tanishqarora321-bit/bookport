# Ship-Sphere — START HERE

**One Booking. All Connected.** Freight-forwarding workspace: bookings & instructions,
shipment tracking, buyers / forwarders / truckers / suppliers with their invoice ledgers,
final invoice + shipping-document PDFs, commission bookings, P&L, freight comparison.

Live site: **https://www.ship-sphere.com** (public landing page at `/`, app behind **Sign in**).

This file is the hand-over note: if you change laptops, hire a developer, or start a new
session with Claude (or any AI assistant), point them at **this file and `ONBOARDING.md`**.
Everything needed to understand, run and continue the project is in this repository.

---

## 1. Where everything lives

| What | Where | Notes |
|---|---|---|
| Source code (this repo) | GitHub `tanishqarora321-bit/bookport`, branch `main` | Every change goes branch → pull request → merge into `main`. |
| Hosting | Vercel project **bookport** (team *shipper1*) | Auto-deploys every merge to `main`. Region `sin1` (Singapore), see `vercel.json`. |
| Database, logins, file storage | Supabase project (region Singapore) | Postgres + Auth + Storage bucket `documents` (private). |
| Email sending | Resend | Instructions emails, shipping-document emails, team invites, website demo requests. |
| PDF / sheet reading (AI) | Google Gemini API | Booking confirmations, BLs, invoices, rate sheets. |
| Domain | ship-sphere.com | Points at Vercel. |

**Secrets are never in this repo.** They live only in Vercel → Project → Settings →
Environment Variables (and a local `.env.local` that git ignores).

## 2. Environment variables (names only)

| Name | What it is | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (anon) key | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** server key — never share | Supabase → Settings → API |
| `GEMINI_API_KEY` | Google AI key | aistudio.google.com |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Optional model overrides | — |
| `RESEND_API_KEY` | Email sending key | resend.com |
| `PLATFORM_EMAIL_FROM_ADDRESS` | Sender address (default notifications@ship-sphere.com) | — |
| `DEMO_REQUEST_TO` | Optional: where website demo requests go (default: owner's Gmail) | — |
| `SUPABASE_JWT_SECRET` | Optional legacy fallback for login verification | Supabase → Settings → API |

## 3. Run it on a new laptop

1. Install **Node.js 20+** and **Git**.
2. `git clone https://github.com/tanishqarora321-bit/bookport.git && cd bookport`
3. `npm install`
4. Create `.env.local` with the variables above (copy the values from Vercel).
5. `npm run dev` → open http://localhost:3000

## 4. The database

- **Schema** = the numbered files in `supabase/migrations/` (0001 → latest), run in order in
  Supabase → SQL Editor. A fresh Supabase project gets the full schema by running them all.
- After a migration is added, the owner runs it in the SQL Editor once (some features show a
  notice when their migration hasn't been run yet).
- `supabase/scripts/` = one-off maintenance scripts that are **never** run automatically
  (e.g. `reset_to_owner_only.sql`, which wipes all data except the owner's login).
- **Backups:** Supabase → Database → Backups.

## 5. Security (audit 2026-11-21)

Plan: `docs/security/SECURITY-TESTING-PLAN.*`. What was found and fixed, and the rules to keep
following, are in `ONBOARDING.md` → *Security*. In short:
- The browser talks to Supabase **only to sign in**; all data goes through the app's server
  routes, each scoped to the signed-in user's company (`getCurrentProfile()` +
  `company_id`), with ids from requests checked by `assertOwned()` (`lib/tenant-guard.ts`).
- Migration `0042_security_lockdown.sql` closes direct database access for browser roles.
- Security headers (CSP, HSTS, no framing…) in `next.config.js`.
- Recommended: two-step login (MFA) for admins, daily backups, keep this repo **private**.

## 6. Continuing the work (developer or AI assistant)

- Read **`ONBOARDING.md`** first: architecture, every module's business rules (decided with
  the owner), conventions, gotchas, and the change log by area.
- Stack: Next.js 14 (App Router) · TypeScript · Tailwind · Supabase · Vercel.
- Check before pushing: `npx tsc --noEmit` and `npx next build`.
- Workflow: work on a branch, open a pull request, squash-merge into `main` → Vercel deploys.
