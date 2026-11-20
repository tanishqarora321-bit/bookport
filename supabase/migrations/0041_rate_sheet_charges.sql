-- ============================================================
-- BOOKPORT · Freight Comparison charges (owner, 2026-11)
--
-- Each forwarder's rate sheet gets the per-container amount added to every
-- rate for the comparison (e.g. UAL +$65 telex, Walker +$35 AES), with
-- per-shipping-line exceptions (UAL: ONE +$75, MSC +$100), plus the
-- charges note read from the email (corrections, handling, free time...).
-- The comparison shows rate + add-on; the original rate stays as read.
-- Safe to run more than once.
-- ============================================================

alter table rate_sheets add column if not exists add_on numeric not null default 0;
alter table rate_sheets add column if not exists add_on_by_line jsonb not null default '{}'::jsonb;
alter table rate_sheets add column if not exists charges_note text;
