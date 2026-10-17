-- ============================================================
-- BOOKPORT · Platform admin: subscription status per company
--
-- A manual status flag Tanishq (the platform owner) controls from a new
-- /admin panel - not real payment processing/Stripe, just a gate on
-- whether that company's users can sign in at all. 'trial'/'active' both
-- allow sign-in; 'cancelled'/'suspended' block it (see
-- lib/supabase/session.ts's getCurrentProfile()).
-- ============================================================

alter table companies add column if not exists subscription_status text not null default 'active'
  check (subscription_status in ('trial', 'active', 'cancelled', 'suspended'));
