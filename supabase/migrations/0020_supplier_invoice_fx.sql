-- ============================================================
-- BOOKPORT · Supplier invoice currency conversion
--
-- Supplier statements (e.g. RECUTEX) come in EUR while reporting here
-- is USD/INR - same cross-currency reporting need forwarder_invoices
-- already solved in 0015, mirrored here. Unlike forwarder_invoices,
-- `total` on this table is a plain trigger-maintained column (see
-- recalc_supplier_invoice_total() on supplier_invoice_items, live but
-- not captured in any migration file), not a generated column itself,
-- so total_usd can reference it directly without Postgres's
-- generated-column-referencing-generated-column restriction.
-- ============================================================

alter table supplier_invoices add column if not exists fx_rate numeric not null default 1;

alter table supplier_invoices add column if not exists total_usd numeric generated always as (
  total * fx_rate
) stored;
