-- ============================================================
-- BOOKPORT · Forwarder email + CC email, for "Send Instructions"
--
-- Instructions only ever go to a forwarder (never the buyer) - the To/Cc
-- fields on the compose modal need to auto-fill from the specific
-- forwarder assigned to that booking, not be typed by hand every time.
-- Added generically to `parties` (not forwarder-specific) since the
-- table is already shared across every role and this is harmless/
-- potentially useful for other roles later - only the Forwarders Edit
-- UI surfaces it for now, per the current ask.
-- ============================================================

alter table parties add column if not exists email text;
alter table parties add column if not exists cc_email text;
