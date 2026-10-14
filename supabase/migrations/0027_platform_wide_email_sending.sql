-- ============================================================
-- BOOKPORT · Email sending moves from per-company Resend accounts to
-- one platform-wide verified domain
--
-- 0026 had every company bring its own Resend API key + verified
-- domain - real friction for onboarding a new client (DNS records,
-- a Resend signup, someone technical enough to do it). Revised per
-- Tanishq: ONE Resend account + ONE verified domain (ship-sphere.com
-- today, swappable later) sends for every company, with each
-- company's own business name as the display name and their own
-- reply-to address so replies land with them, not the platform. This
-- also means every client's emails carry Ship-Sphere branding in the
-- headers - the "marketing gimmick" Tanishq specifically wanted.
--
-- api_key/provider move out of the database entirely (RESEND_API_KEY
-- becomes an env var, same as GEMINI_API_KEY) - a secret per company
-- row was never going to be the right shape for a single shared key.
-- ============================================================

alter table company_email_settings rename column from_email to reply_to;
alter table company_email_settings drop column if exists api_key;
alter table company_email_settings drop column if exists provider;
