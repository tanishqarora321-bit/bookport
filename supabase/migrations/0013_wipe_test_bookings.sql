-- ============================================================
-- BOOKPORT · One-time wipe of test booking data
--
-- The Booking & Instructions grid has accumulated duplicate/sample
-- entries from testing (the extraction PDF flow, manual entry, and
-- this migration's own row-count didn't line up with real bookings).
-- This clears every booking and everything that hangs off one, so a
-- clean slate is available to test manual entry / PDF upload / Excel
-- import against. Forwarder/Trucker/Supplier/Buyer master records
-- (the companies themselves) are NOT touched - only booking-linked
-- rows. Safe to re-run (every statement is a no-op once its target
-- table is already empty).
-- ============================================================

-- generated_documents.tracking_id is NOT NULL, so those rows must go
-- before the tracking rows they point at can be deleted.
delete from generated_documents where tracking_id in (select id from tracking where booking_id is not null);

-- forwarder/trucker/supplier invoices reference tracking nullably and
-- carry their own stored snapshot fields (consignee/pol/pod/etc) - they
-- aren't booking-module data, so detach rather than delete them.
update forwarder_invoices set tracking_id = null where tracking_id in (select id from tracking where booking_id is not null);
update trucker_invoices set tracking_id = null where tracking_id in (select id from tracking where booking_id is not null);
update supplier_invoices set tracking_id = null where tracking_id in (select id from tracking where booking_id is not null);

-- tracking.booking_id has no ON DELETE clause, so it must be cleared
-- explicitly before bookings can go (tracking_notifications cascades
-- from tracking automatically).
delete from tracking where booking_id is not null;

-- invoices/offers/rate_quotes reference bookings with no ON DELETE
-- clause too. Deleting invoices first cascades invoice_lines and
-- payments automatically (both cascade from invoices).
delete from invoices where booking_id is not null;
delete from offers where booking_id is not null;
delete from rate_quotes where booking_id is not null;

-- Everything else that references bookings.id (booking_parties,
-- transport_legs, containers, tracking_events, trucking_jobs, charges,
-- documents, amendments, booking_consignee_items) has ON DELETE
-- CASCADE, so one delete here clears the whole module.
delete from bookings;
