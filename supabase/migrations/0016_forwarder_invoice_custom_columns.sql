-- ============================================================
-- BOOKPORT · Custom charge columns for forwarder invoices
--
-- The 6 fixed charge columns (freight/BL/AES/extra/correction/
-- demurrage) don't cover every charge type a real forwarder invoice
-- has. Rather than an ever-growing list of nullable columns, extra
-- charges live in one jsonb blob per invoice, keyed by a short slug;
-- the metadata table below is the single shared definition of which
-- keys exist and what to label them - shared across the whole
-- company (every forwarder's ledger shows the same custom columns),
-- capped at 10 by the API route, not enforced here at the DB level.
-- ============================================================

create table if not exists forwarder_invoice_custom_columns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  key text not null,
  label text not null,
  created_at timestamptz default now(),
  unique (company_id, key)
);

alter table forwarder_invoice_custom_columns enable row level security;

drop policy if exists forwarder_invoice_custom_columns_company_isolation on forwarder_invoice_custom_columns;
create policy forwarder_invoice_custom_columns_company_isolation on forwarder_invoice_custom_columns
  for all using (company_id = current_company_id())
  with check (company_id = current_company_id());

alter table forwarder_invoices add column if not exists custom_charges jsonb not null default '{}'::jsonb;
