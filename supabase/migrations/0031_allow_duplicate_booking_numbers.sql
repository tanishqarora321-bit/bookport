-- ============================================================
-- BOOKPORT · Allow duplicate carrier_booking_no (Multiple Bookings)
--
-- Migration 0014 made carrier_booking_no unique per company to stop
-- accidental double entry. In practice, the same carrier booking number
-- legitimately gets reused sometimes (the carrier reissues/amends a
-- booking under the same reference, a booking gets split, etc.) - and
-- that hard constraint meant there was simply no way to save the second
-- one at all, in manual entry, PDF review, or any import.
--
-- Dropping the unique constraint doesn't mean "anything goes": the app
-- now treats a carrier_booking_no that appears more than once for a
-- company as needing review, surfaced on a separate "Multiple Bookings
-- & Instructions" page instead of blocking the entry outright. The plain
-- index (non-unique) stays so the grouping-by-carrier_booking_no queries
-- that page relies on, and the existing app-level duplicate checks in
-- the import routes, stay fast.
-- ============================================================

drop index if exists bookings_company_carrier_booking_no_key;

create index if not exists bookings_company_carrier_booking_no_idx
  on bookings (company_id, carrier_booking_no)
  where carrier_booking_no is not null;
