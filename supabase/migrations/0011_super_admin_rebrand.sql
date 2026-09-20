-- ============================================================
-- BOOKPORT · Formalize the default company as the super admin's tenant
--
-- lib/supabase/session.ts already treats "admin of DEFAULT_COMPANY_ID"
-- as the platform/super admin (is_platform_owner). That company row
-- was seeded by migration 0003 as generic placeholder data ("Default
-- Company" / "default-company"); it's now a real product decision
-- that this IS the super admin's own company, so it gets the product
-- name instead of a placeholder label.
-- ============================================================

update companies
set name = 'Ship-Sphere', slug = 'ship-sphere'
where id = '00000000-0000-0000-0000-000000000001';
