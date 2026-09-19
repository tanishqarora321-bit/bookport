-- ============================================================
-- BOOKPORT · Seat-limited multi-user login, foundation
--
-- Adds the one piece of schema needed for "a company can activate
-- up to N teammate logins, based on what they've paid for": a seat
-- count on the company row. Enforcement happens in application code
-- (app/api/team/invite) at invite time, not here - Postgres can't
-- easily count "seats used so far" as a CHECK constraint without a
-- trigger, and a trigger is unnecessary complexity for a number that
-- changes by admin action, not by arbitrary writes.
-- ============================================================

alter table companies add column if not exists seat_limit int not null default 5;

-- Soft-deactivate, not hard-delete, for the same reason parties/items
-- already work this way: bookings.owner_user_id, documents.uploaded_by,
-- amendments.created_by and audit_log.user_id all reference profiles(id)
-- with no ON DELETE clause (defaults to NO ACTION/RESTRICT), so hard-
-- deleting a profile that has ANY activity history would fail with a
-- foreign key violation. Removing a teammate sets is_active = false and
-- bans their Supabase auth account instead - it frees the seat without
-- touching any history that references them.
alter table profiles add column if not exists is_active boolean not null default true;
