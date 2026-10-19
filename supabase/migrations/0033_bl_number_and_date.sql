-- ============================================================
-- BOOKPORT · Real Bill of Lading number + issue date
--
-- bookings.bl_issued_at (added in migration 0002) is misleadingly named -
-- it's actually the BL's PLACE of issue (a city, e.g. "HOUSTON"), not a
-- date or the BL's own document number. Neither of those exist yet, and
-- both are needed once the BL itself gets uploaded/extracted (see the
-- new "Upload BL" feature on Booking & Instructions): bl_date in
-- particular feeds "3 days after BL issued date" used by the Fumigation
-- Certificate / Certificate of Origin / Commercial Invoice generators.
-- bl_issued_at itself is untouched - still place-of-issue, as before.
-- ============================================================

alter table bookings add column if not exists bl_number text;
alter table bookings add column if not exists bl_date date;
