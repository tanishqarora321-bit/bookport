-- ============================================================
-- BOOKPORT · Multi-tenant foundation + Items + Tracking (flat grid)
--
-- RECONSTRUCTED MIGRATION — see README note at the bottom of this
-- file before assuming this is byte-for-byte what ran live.
--
-- This SQL was never committed at the time it was written: it was
-- pasted directly into the Supabase SQL editor during development
-- and the app code was built against whatever actually ran there.
-- This file reconstructs it from (a) the live schema, introspected
-- via the Supabase REST OpenAPI endpoint with the service-role key
-- — table/column names, types, nullability and foreign keys below
-- are verified against the live database, not guessed — and (b)
-- the written project handoff notes, for the RLS/function intent
-- that isn't visible through that introspection. Every statement
-- is idempotent (`if not exists` / `drop ... if exists` + recreate)
-- so it is safe to run against the already-live database (no-op on
-- anything that already matches) and also works to bootstrap a
-- brand-new database from 0001 onward.
-- ============================================================

-- ---------- Companies: the tenant boundary ----------

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan_tier text not null default 'starter',
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table companies enable row level security;

-- Seed the placeholder tenant every service-role query currently
-- hardcodes via lib/constants.ts DEFAULT_COMPANY_ID, until real
-- login/auth replaces it with the signed-in user's own company_id.
-- Safe no-op if this id already exists (it does, in production).
insert into companies (id, name, slug, plan_tier)
values ('00000000-0000-0000-0000-000000000001', 'Default Company', 'default-company', 'starter')
on conflict (id) do nothing;

-- ---------- company_id retrofit on every pre-existing tenant-scoped table ----------
-- Master/lookup tables (charge_heads, ports, currencies, cutoff_label_aliases)
-- are deliberately NOT scoped — they're shared reference data across all tenants.

alter table profiles       add column if not exists company_id uuid references companies(id);
alter table parties        add column if not exists company_id uuid references companies(id);
alter table party_contacts add column if not exists company_id uuid references companies(id);
alter table bookings       add column if not exists company_id uuid references companies(id);
alter table booking_parties add column if not exists company_id uuid references companies(id);
alter table transport_legs add column if not exists company_id uuid references companies(id);
alter table containers     add column if not exists company_id uuid references companies(id);
alter table tracking_events add column if not exists company_id uuid references companies(id);
alter table trucking_jobs  add column if not exists company_id uuid references companies(id);
alter table rate_quotes    add column if not exists company_id uuid references companies(id);
alter table offers         add column if not exists company_id uuid references companies(id);
alter table charges        add column if not exists company_id uuid references companies(id);
alter table invoices       add column if not exists company_id uuid references companies(id);
alter table invoice_lines  add column if not exists company_id uuid references companies(id);
alter table payments       add column if not exists company_id uuid references companies(id);
alter table documents      add column if not exists company_id uuid references companies(id);
alter table amendments     add column if not exists company_id uuid references companies(id);
alter table audit_log      add column if not exists company_id uuid references companies(id);

-- Backfill every existing row to the default tenant before any
-- column below gets a NOT NULL constraint (this order matters —
-- see the migration-ordering bug noted at the bottom of this file).
update profiles     set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
update parties       set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
update bookings      set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;

-- Only bookings/parties/profiles are NOT NULL live — the rest of the
-- 0001 tables kept company_id nullable during the retrofit.
alter table profiles  alter column company_id set not null;
alter table parties   alter column company_id set not null;
alter table bookings  alter column company_id set not null;

-- ---------- current_company_id(): defined AFTER profiles.company_id exists ----------
-- Postgres validates a SQL-language function body against the catalog at
-- CREATE time, so this must come after the column above or it fails loudly
-- (this bit the original session — see notes at the bottom of this file).
create or replace function current_company_id() returns uuid as $$
  select company_id from profiles where id = auth.uid();
$$ language sql stable;

-- ---------- Items (company-scoped, soft-delete) ----------

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table items enable row level security;

-- ---------- Tracking: the flat Excel-shaped grid ----------
-- Deliberately separate from tracking_events (the 0001 milestone-based
-- table) — this is the 16-column sheet from the brief, one row per
-- booking/party/item assignment. ETA and release_status live ONLY
-- here; every other module reads them via a live join, never a copy.

create table if not exists tracking (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  booking_id uuid references bookings(id),
  party_id uuid references parties(id),
  item_id uuid references items(id),
  consignee_as_per_bl text,
  invoice_no text,
  booking_number text,
  container_number text,
  eta date,
  forwarder_name text,
  release_status text,
  shipping_line text,
  invoice_sent boolean default false,
  documents_sent boolean default false,
  remarks text,
  bl_number text,
  bl_status text default 'N',
  ocean_freight numeric,
  ocean_freight_currency text references currencies(code),
  last_tracking_check_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tracking enable row level security;

create table if not exists tracking_notifications (
  id uuid primary key default gen_random_uuid(),
  tracking_id uuid references tracking(id) on delete cascade,
  changed_fields text[] not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

alter table tracking_notifications enable row level security;

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  doc_type text not null,
  template_config jsonb not null,
  is_default boolean default true,
  created_at timestamptz default now()
);

alter table document_templates enable row level security;

-- Scaffolded for future single-device-login enforcement — not wired
-- up in the app yet (explicitly deferred per the project brief).
create table if not exists active_sessions (
  user_id uuid primary key references profiles(id),
  session_token uuid not null default gen_random_uuid(),
  device_label text,
  last_seen_at timestamptz default now()
);

alter table active_sessions enable row level security;

-- ---------- RLS: company isolation ----------
-- Best-effort reconstruction of the "every table scoped by
-- current_company_id()" pattern described in the handoff notes.
-- NOT independently verified against the live policy definitions
-- (Postgres doesn't expose those over the REST API this was built
-- with) — safe to leave as-is for now since every current app query
-- goes through the service-role client (bypasses RLS entirely, see
-- lib/supabase/server.ts), but should be checked against the real
-- pg_policies rows before real Supabase Auth logins depend on it.

-- Only tables that actually carry a company_id column go through this
-- loop. `companies` (the tenant row itself), `tracking_notifications`
-- (scoped indirectly via tracking_id -> tracking.company_id) and
-- `active_sessions` (scoped via user_id -> profiles.company_id) do
-- NOT have their own company_id column, per the verified live schema —
-- they're deliberately excluded here rather than given a broken policy.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'items','tracking','document_templates','profiles','parties','bookings'
  ]) loop
    execute format('drop policy if exists %I_company_isolation on %I', t, t);
    execute format(
      'create policy %I_company_isolation on %I for all using (company_id = current_company_id() or (%I.company_id is null and current_company_id() is not null)) with check (company_id = current_company_id())',
      t, t, t
    );
  end loop;
end $$;

-- companies itself has no company_id column (it IS the tenant) —
-- scope by row identity instead of a company_id match.
drop policy if exists companies_company_isolation on companies;
create policy companies_self on companies for select using (
  id = current_company_id()
);

-- ============================================================
-- Notes carried over from the original (uncommitted) session,
-- kept here so this history isn't lost a second time:
--
-- - Roles reuse the same `parties` table (Buyers/Forwarders/
--   Truckers/Suppliers are all `parties` rows filtered by the
--   `roles text[]` column) — no separate tables per role.
-- - Soft-delete, not hard delete: `parties`/`items` use `is_active`
--   toggled by a Remove/Restore button, never an actual DELETE,
--   because hard-deleting would break historical invoices/P&L
--   that reference them.
-- - Live-join, never denormalize dynamic fields: ETA/release_status
--   live only on `tracking`; forwarder/trucker invoices link via
--   `tracking_id` and read those fields live at render time rather
--   than copying them, so there is no stale copy to go out of sync.
-- - Migration-ordering bug (why current_company_id() is defined
--   where it is above): a SQL-language function body is validated
--   against the catalog at CREATE time, so defining it before
--   profiles.company_id existed failed immediately once actually
--   run — it would NOT have been caught by reading the SQL alone.
-- ============================================================
