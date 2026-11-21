-- ============================================================
-- SHIP-SPHERE · 0042 Security lockdown (security audit 2026-11)
--
-- The website only ever reads and writes data through its own server
-- (API routes using the secret service-role key, each scoped to the
-- signed-in user's company). The browser uses Supabase ONLY to sign in.
-- But Supabase also exposes every table directly at
-- https://<project>.supabase.co/rest/v1/... to anyone holding the
-- public "anon" key (it is visible in the website's JavaScript) plus,
-- optionally, a signed-in user's token. What protected that door was
-- Row Level Security, and the audit found it had holes:
--
--   * parties_select / booking_parties_select were `using (true)`:
--     anyone could list every company's buyers, forwarders, truckers
--     and suppliers (names, addresses, contacts).
--   * parties_write / bookings_select / bookings_write only checked the
--     ROLE, not the company: any signed-in user could read every
--     company's bookings and edit or delete any company's parties.
--   * profiles_self_update (and the profiles company policy) let a
--     signed-in user edit their OWN profile row - including `role`,
--     `company_id` and `is_active`. A staff user could make themselves
--     admin, move into another company, or (company 0...001 + admin)
--     become the platform owner.
--   * 9 tables had no RLS at all (containers, rate_sheet_entries,
--     supplier_invoice_items, booking_consignee_items, offer_sheet_rows,
--     charge_heads, ports, currencies, cutoff_label_aliases).
--
-- Since nothing in the browser needs that door, this closes it
-- completely instead of patching policy by policy:
--   1. RLS is switched ON for every table in the public schema.
--   2. The over-broad policies above are dropped.
--   3. The `anon` and `authenticated` roles lose ALL table, sequence and
--      function privileges in the public schema (now and for tables
--      created later). The server's service-role key is unaffected, so
--      the app keeps working exactly as before.
--   4. The "documents" storage bucket is made private (the app only
--      hands out short-lived signed links).
--
-- Safe to run more than once.
-- ============================================================

-- 1. RLS on for every public table (catches tables made outside migrations too).
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- 2. Drop the policies that leaked data across companies or allowed
--    self-promotion.
drop policy if exists parties_select on parties;
drop policy if exists parties_write on parties;
drop policy if exists booking_parties_select on booking_parties;
drop policy if exists bookings_select on bookings;
drop policy if exists bookings_write on bookings;
drop policy if exists profiles_self_update on profiles;
drop policy if exists profiles_company_isolation on profiles;
-- A user may still read their own profile row (harmless; never written).
drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles for select to authenticated using (id = auth.uid());

-- 3. No direct table / function access for browser roles.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Same for anything created later by the usual owner roles.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    execute 'alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated';
  end if;
end $$;

-- The policies that remain use these helpers; they run as their owner.
grant execute on function current_company_id() to authenticated;
grant execute on function current_role_name() to authenticated;
-- profiles_self_select above needs SELECT on profiles for signed-in users.
grant select on profiles to authenticated;

-- The server (service role) keeps full access.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 4. Generated / uploaded PDFs stay private (served via signed links only).
update storage.buckets set public = false where id = 'documents';

-- ============================================================
-- CHECK (run after the above; each should return 0 rows):
--
--   -- tables still without RLS
--   select tablename from pg_tables where schemaname='public' and not rowsecurity;
--
--   -- anything the public/anon role can still touch
--   select table_name, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and grantee in ('anon');
--
--   -- public storage buckets
--   select id from storage.buckets where public;
-- ============================================================
