-- ============================================================
-- BOOKPORT · Prohibit duplicate Booking Numbers
--
-- carrier_booking_no (added in migration 0002) never had a uniqueness
-- constraint - it's a plain text column, so nothing at the database
-- level stopped the same booking number being entered twice, whether
-- via manual entry, the PDF-review form, or Excel import. A partial
-- unique index (ignoring nulls) enforces this per company, and is the
-- backstop the app-level checks in each entry path now rely on.
-- ============================================================

create unique index if not exists bookings_company_carrier_booking_no_key
  on bookings (company_id, carrier_booking_no)
  where carrier_booking_no is not null;
