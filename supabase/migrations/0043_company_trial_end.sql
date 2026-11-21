-- ============================================================
-- SHIP-SPHERE · 0043 Free-trial end date per company (owner, 2026-11)
--
-- Platform Admin sets a company's "Trial ends" date (which puts it on
-- Trial). From 5 days before that date its users get a daily "recharge
-- your account" popup; after the date they are locked out until the
-- platform owner sets the company to Active. Safe to run more than once.
-- ============================================================
alter table companies add column if not exists trial_ends_at date;
