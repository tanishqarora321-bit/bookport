-- ============================================================
-- BOOKPORT · bookings.booking_no uniqueness: global -> per company
--
-- bookings.booking_no ("BP-26-0001") has been globally unique since the
-- original single-tenant schema (0001_init.sql: `booking_no text not
-- null unique`). lib/booking-number.ts was just changed (as part of the
-- company-scoping security sweep) to generate each company's own
-- BP-YY-NNNN sequence starting from 0001 - but the global constraint
-- means a second company's very first booking collides with the first
-- company's "BP-26-0001" and fails outright. Caught live by the
-- two-company isolation test. Same fix shape as migration 0014 did for
-- carrier_booking_no: drop the global unique constraint, add a
-- composite (company_id, booking_no) one instead.
-- ============================================================

alter table bookings drop constraint if exists bookings_booking_no_key;

create unique index if not exists bookings_company_booking_no_key
  on bookings (company_id, booking_no);
