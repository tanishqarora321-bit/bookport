-- Adds the fields introduced by the 11-field extraction spec that didn't
-- already exist on bookings. The other 7 of the 11 map onto existing
-- columns:
--   booking_number  -> carrier_booking_no
--   doc_cutoff      -> si_cutoff
--   cargo_cutoff    -> cargo_cutoff (already existed)
--   pol             -> pol
--   port_of_discharge -> pod
--   port_of_delivery  -> final_destination
--   shipping_line   -> carrier

alter table bookings add column if not exists erd timestamptz;
alter table bookings add column if not exists bl_issued_at text;
alter table bookings add column if not exists forwarder_name text;
alter table bookings add column if not exists container_size text;
