-- ============================================================
-- BOOKPORT · Close the profiles RLS gap
--
-- Migration 0003 defined a `profiles_company_isolation` policy on
-- `profiles` but never ran `alter table profiles enable row level
-- security` for it — a policy with RLS not enabled is inert, so
-- until this runs, any client holding the anon key can read/write
-- every row in `profiles` (every user's name, role, company_id,
-- across every tenant) via PostgREST. Nothing in the app currently
-- queries profiles that way (the sidebar/team page go through
-- service-role server routes), but this closes the gap before
-- anything ever does.
-- ============================================================

-- current_company_id() selects from profiles itself. Once RLS is
-- enabled below, that inner select would be subject to the very
-- policy it's being used to evaluate (id = auth.uid() -> needs
-- company_id -> re-checks the policy -> ...). SECURITY DEFINER runs
-- the function as its owner, bypassing RLS for that inner lookup,
-- which is the standard way to break this recursion.
create or replace function current_company_id() returns uuid as $$
  select company_id from profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- Belt-and-suspenders: a user can always see and edit their own row,
-- independent of the company_id match in profiles_company_isolation
-- (matches the "at minimum" bar noted when this gap was first found).
drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles for select using (id = auth.uid());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- profiles_company_isolation (from migration 0003) already exists and
-- covers company-scoped select/update/delete for everyone else in the
-- same company; its `with check` also means an authenticated (non
-- service-role) client can never INSERT a profiles row for a company
-- other than their own, and a brand-new user with no row yet (so
-- current_company_id() is null) can't insert one at all — invites
-- stay service-role-only, which is what the invite routes already do.

alter table profiles enable row level security;
