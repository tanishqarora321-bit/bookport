-- ============================================================
-- BOOKPORT · Instruction Status column on Booking & Instructions
--
-- Separate from `status` (draft/confirmed/in_transit/delivered/
-- cancelled, the shipment's own lifecycle) - this tracks whether
-- shipping instructions have been sent to the carrier for this
-- booking: blank (not set), 'sent', or 'not_sent'.
-- ============================================================

alter table bookings add column if not exists instruction_status text;
