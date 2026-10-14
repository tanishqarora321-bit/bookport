-- ============================================================
-- BOOKPORT · Fix tables left publicly readable with no RLS
--
-- Supabase's security advisor flagged "Table publicly accessible"
-- (rls_disabled_in_public) for this project. Live-probed every table in
-- the schema with the anon key (insert a marker row via service role,
-- then try to read that exact row back with the anon key, no session) -
-- these 11 tables came back readable by anyone holding the public anon
-- key, same key that ships inside the app's own front-end JS:
--
--   amendments, transport_legs, tracking_events, trucking_jobs,
--   documents, offers, rate_quotes, invoice_lines, payments,
--   party_contacts, audit_log
--
-- All 11 are leftovers from the original single-tenant schema (0001)
-- that never got a company_id column or a current_company_id()-based
-- policy when multi-tenancy was retrofitted in 0003+ - unlike every
-- table built since, which got RLS from day one. None of this changes
-- app behavior: every route in this app reads/writes through the
-- service-role client (lib/supabase/server.ts), which bypasses RLS
-- entirely - this closes the hole for anyone hitting the anon REST API
-- directly, not for the app itself.
-- ============================================================

alter table amendments enable row level security;
drop policy if exists amendments_company_isolation on amendments;
create policy amendments_company_isolation on amendments
  for all using (
    booking_id in (select id from bookings where company_id = current_company_id())
  )
  with check (
    booking_id in (select id from bookings where company_id = current_company_id())
  );

alter table transport_legs enable row level security;
drop policy if exists transport_legs_company_isolation on transport_legs;
create policy transport_legs_company_isolation on transport_legs
  for all using (
    booking_id in (select id from bookings where company_id = current_company_id())
  )
  with check (
    booking_id in (select id from bookings where company_id = current_company_id())
  );

alter table tracking_events enable row level security;
drop policy if exists tracking_events_company_isolation on tracking_events;
create policy tracking_events_company_isolation on tracking_events
  for all using (
    booking_id in (select id from bookings where company_id = current_company_id())
  )
  with check (
    booking_id in (select id from bookings where company_id = current_company_id())
  );

alter table trucking_jobs enable row level security;
drop policy if exists trucking_jobs_company_isolation on trucking_jobs;
create policy trucking_jobs_company_isolation on trucking_jobs
  for all using (
    booking_id in (select id from bookings where company_id = current_company_id())
  )
  with check (
    booking_id in (select id from bookings where company_id = current_company_id())
  );

alter table documents enable row level security;
drop policy if exists documents_company_isolation on documents;
create policy documents_company_isolation on documents
  for all using (
    booking_id in (select id from bookings where company_id = current_company_id())
  )
  with check (
    booking_id in (select id from bookings where company_id = current_company_id())
  );

-- offers/rate_quotes predate company_id entirely (no column to join on
-- besides the nullable booking_id) - a row with no booking_id yet
-- becomes invisible under this policy for a non-service-role client,
-- same "hide the ambiguous case" trade-off as audit_log below. Neither
-- table has any real write path in the app today besides the generic
-- "detach on booking delete" loop in app/api/bookings/[id]/route.ts.
alter table offers enable row level security;
drop policy if exists offers_company_isolation on offers;
create policy offers_company_isolation on offers
  for all using (
    booking_id in (select id from bookings where company_id = current_company_id())
  )
  with check (
    booking_id in (select id from bookings where company_id = current_company_id())
  );

alter table rate_quotes enable row level security;
drop policy if exists rate_quotes_company_isolation on rate_quotes;
create policy rate_quotes_company_isolation on rate_quotes
  for all using (
    booking_id in (select id from bookings where company_id = current_company_id())
  )
  with check (
    booking_id in (select id from bookings where company_id = current_company_id())
  );

-- invoices already has both company_id (added in 0003) and RLS enabled
-- (0001) - invoice_lines/payments only reference invoices(id), so they
-- scope through that.
alter table invoice_lines enable row level security;
drop policy if exists invoice_lines_company_isolation on invoice_lines;
create policy invoice_lines_company_isolation on invoice_lines
  for all using (
    invoice_id in (select id from invoices where company_id = current_company_id())
  )
  with check (
    invoice_id in (select id from invoices where company_id = current_company_id())
  );

alter table payments enable row level security;
drop policy if exists payments_company_isolation on payments;
create policy payments_company_isolation on payments
  for all using (
    invoice_id in (select id from invoices where company_id = current_company_id())
  )
  with check (
    invoice_id in (select id from invoices where company_id = current_company_id())
  );

alter table party_contacts enable row level security;
drop policy if exists party_contacts_company_isolation on party_contacts;
create policy party_contacts_company_isolation on party_contacts
  for all using (
    party_id in (select id from parties where company_id = current_company_id())
  )
  with check (
    party_id in (select id from parties where company_id = current_company_id())
  );

-- audit_log.entity_id is polymorphic (entity names which table it points
-- into), so it can't be joined to a single company_id the way every
-- other table here can. Scoping by user_id is the only option, but
-- every current write (app/api/amendments/route.ts) inserts user_id as
-- null - meaning this policy hides every row from anon/authenticated
-- clients today (fail closed), which is the correct default for a log
-- table nothing in the app currently reads back out anyway.
alter table audit_log enable row level security;
drop policy if exists audit_log_company_isolation on audit_log;
create policy audit_log_company_isolation on audit_log
  for all using (
    user_id in (select id from profiles where company_id = current_company_id())
  )
  with check (
    user_id in (select id from profiles where company_id = current_company_id())
  );
