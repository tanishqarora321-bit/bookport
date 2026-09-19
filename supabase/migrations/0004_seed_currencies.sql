-- ============================================================
-- BOOKPORT · Seed currencies
-- RECONSTRUCTED — see the note at the bottom of 0003 for why.
-- The `currencies` table existed since 0001 but was never
-- populated; several FK columns added since (tracking.ocean_freight_currency,
-- forwarder_invoices.currency, trucker_invoices.currency) reference it.
-- ============================================================

insert into currencies (code, name) values
  ('USD', 'US Dollar'),
  ('INR', 'Indian Rupee'),
  ('EUR', 'Euro'),
  ('GBP', 'British Pound'),
  ('AED', 'UAE Dirham')
on conflict (code) do nothing;
